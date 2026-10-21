/**
 * The server's signing secret, for sessions and signed storage URLs.
 *
 * The development fallback is published in this repository, so production
 * refuses to start with it.
 */
const DEV_SECRET = 'dev-secret-change-me-in-production-and-keep-it-long-at-least-32-chars';

export const SERVER_SECRET: string = process.env.BETTER_AUTH_SECRET || process.env.JWT_SECRET || DEV_SECRET;

if (process.env.NODE_ENV === 'production' && SERVER_SECRET === DEV_SECRET) {
  throw new Error('BETTER_AUTH_SECRET must be set to a strong random value when NODE_ENV=production.');
}
