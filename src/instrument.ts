import * as Sentry from '@sentry/node';
import { version } from '../package.json';

/**
 * Error tracking. Imported by server.ts before the app is built so Sentry can
 * hook the HTTP server. Does nothing unless SENTRY_DSN is set.
 */
if (process.env.SENTRY_DSN && process.env.NODE_ENV !== 'test') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: `societyops-ai@${version}`,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0,
    // Request bodies carry residents' names, phones and complaint text, and
    // query strings carry signed-URL signatures; neither may leave the server.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpBodies: [],
      urlQueryParams: false,
      httpHeaders: { request: { allow: ['user-agent', 'content-type', 'x-request-id'] }, response: false },
    },
  });
}
