import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer, phoneNumber } from 'better-auth/plugins';
import { unscopedPrisma } from '../database/prisma';
import { canonicalPhone } from '../services/phone';
import { getOtpSender } from '../services/otp';
import { SERVER_SECRET } from './secret';

/**
 * Authentication: phone + password, phone + one-time code, sessions.
 *
 * Replaces the hand-written JWT login. Sessions are database rows referenced
 * by an httpOnly cookie, so a token no longer sits in browser storage and
 * signing out (or removing a member) actually ends the session. The bearer
 * plugin also accepts the session token as `Authorization: Bearer`, for the
 * API tests and a future native app.
 */

/** Phone-first users have no email yet; Better Auth needs a unique one. */
export const placeholderEmail = (phone: string) => `${phone.replace(/[^0-9]/g, '')}@users.societyops.invalid`;

export const isPlaceholderEmail = (email: string) => email.endsWith('@users.societyops.invalid');

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;

/** The first value that parses as a URL; placeholders like "MY_APP_URL" are skipped. */
function firstUrl(...values: (string | undefined)[]): string | undefined {
  return values.find((v) => {
    try {
      return !!v && !!new URL(v);
    } catch {
      return false;
    }
  });
}

/** The header server.ts uses to hand Better Auth the client's address. */
export const CLIENT_IP_HEADER = 'x-societyops-client-ip';

export const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

export const auth = betterAuth({
  appName: 'SocietyOps AI',
  basePath: '/api/auth',
  baseURL: firstUrl(process.env.BETTER_AUTH_URL, process.env.APP_URL) ?? 'http://localhost:3000',
  secret: SERVER_SECRET,
  trustedOrigins: allowedOrigins,
  database: prismaAdapter(unscopedPrisma, { provider: 'postgresql' }),
  telemetry: { enabled: false },

  // Passwords are a fallback to OTP. There is no public email sign-up: accounts
  // are created by phone verification, then given a password.
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
    // bcrypt, so hashes carried over from the old ResidentPassword table still verify.
    password: {
      hash: (password) => bcrypt.hash(password, BCRYPT_ROUNDS),
      verify: ({ hash, password }) => bcrypt.compare(password, hash),
    },
    revokeSessionsOnPasswordReset: true,
  },

  user: {
    additionalFields: {
      platformRole: { type: 'string', required: false, input: false },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    additionalFields: {
      activeSocietyId: { type: 'string', required: false, input: false },
    },
  },

  advanced: {
    database: { generateId: () => crypto.randomUUID() },
    // Set by server.ts from Express's req.ip, overwriting anything the client
    // sent. Without a client IP every rate limit is one bucket shared by all
    // users, so five OTP requests from anyone would lock everyone out.
    ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    useSecureCookies: process.env.NODE_ENV === 'production',
  },

  rateLimit: {
    // The API tests sign in many times a run.
    enabled: process.env.NODE_ENV !== 'test',
    window: 60,
    max: 100,
    customRules: {
      '/phone-number/send-otp': { window: 60 * 10, max: 5 },
      '/phone-number/verify': { window: 60 * 10, max: 10 },
      '/sign-in/phone-number': { window: 60 * 15, max: 10 },
      '/phone-number/request-password-reset': { window: 60 * 10, max: 5 },
    },
  },

  plugins: [
    phoneNumber({
      otpLength: 6,
      expiresIn: 5 * 60,
      allowedAttempts: 5,
      // Only canonical numbers (+<country><number>) are accepted, the same form
      // routes/schemas produces, so one phone is always one user.
      phoneNumberValidator: (phone) => canonicalPhone(phone) === phone,
      sendOTP: ({ phoneNumber: phone, code }) => getOtpSender().send(phone, code, 'sign-in'),
      sendPasswordResetOTP: ({ phoneNumber: phone, code }) => getOtpSender().send(phone, code, 'password-reset'),
      // Verifying an unknown number creates the account: this is how people
      // sign up. They choose a name and password next (routes/account).
      signUpOnVerification: {
        getTempEmail: placeholderEmail,
        getTempName: () => '',
      },
    }),
    bearer(),
  ],
});

export type AuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;
