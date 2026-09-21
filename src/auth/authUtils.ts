import jwt from 'jsonwebtoken';



  // -------------------------------------------------

  // Configuration – read from environment, with safe fallback for local dev only

  // -------------------------------------------------

  export const JWT_SECRET: string =

    process.env.JWT_SECRET ||

    // In production you MUST set JWT_SECRET; the fallback is only to keep the app running while you develop.

    'dev-secret-change-me-in-production-and-keep-it-long-at-least-32-chars';



  // How long the token is valid. You can also make this configurable via env.

  export const JWT_EXPIRES_IN: jwt.SignOptions['expiresIn'] = '24h'; // e.g., "24h", "7d", "15m"



  // -------------------------------------------------

  // Token creation

  // -------------------------------------------------

  /**

   * Generate a signed JWT from a payload.

   * The payload should contain the minimal user info you need downstream

   * (id, name, flatNumber, role). Do NOT put passwords or other secrets here.

   */

  export function generateToken(payload: any): string {

    // `jwt.sign` will add `iat` (issued at) and `exp` (expiration) automatically.

    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

  }



  // -------------------------------------------------

  // Token verification

  // -------------------------------------------------

  /**

   * Verify a JWT and return its decoded payload.

   * Returns null if the token is invalid, expired, or malformed.

   */

  export function verifyToken(token: string): any | null {

    try {

      return jwt.verify(token, JWT_SECRET);

    } catch (err) {

      // You could log err.message here if you have a logger set up.

      return null;

    }

  }



  // -------------------------------------------------

  // (Optional) Helper to attach user info to request – used by middleware

  // -------------------------------------------------

  export interface JwtPayload {

    id: string;

    name: string;

    flatNumber: string;

    role: 'resident' | 'facility_manager' | 'admin';

    iat?: number;

    exp?: number;

  }

    // At the top, after other imports
  import bcrypt from 'bcryptjs';

  // Configurable work factor – higher = slower but more secure.
  // 12 is a good default for 2026; you can raise it later via env.
  export const BCRYPT_SALT_ROUNDS: number =
    parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10);

  // -------------------------------------------------
  // Password hashing (async because bcrypt uses libuv thread pool)
  // -------------------------------------------------
  /**
   * Hash a plain‑text password with a generated salt.
   * Returns a promise that resolves to the hashed string.
   */
  export async function hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
    return bcrypt.hash(password, salt);
  }

  // -------------------------------------------------
  // Password verification
  // -------------------------------------------------
  /**
   * Compare a plain‑text password with a stored hash.
   * Returns true if they match, false otherwise.
   */
  export async function verifyPassword(
    plainPassword: string,
    hashedPassword: string
  ): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }