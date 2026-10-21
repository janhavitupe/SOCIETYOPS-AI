import winston from 'winston';
import morgan from 'morgan';
import { currentRequestId } from './requestContext';

/** Stamps every line with the id of the request being served, when there is one. */
const withRequestId = winston.format((info) => {
  const requestId = currentRequestId();
  if (requestId) info.requestId = requestId;
  return info;
});

// Production writes one JSON object per line for the log collector; locally
// the same fields are printed in a readable, coloured line.
const consoleFormat =
  process.env.NODE_ENV === 'production'
    ? winston.format.json()
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
          return `${timestamp} [${level}]: ${message} ${metaStr}`;
        }),
      );

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    withRequestId(),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { service: 'societyops-api' },
  transports: [new winston.transports.Console({ format: consoleFormat })],
});

export const morganMiddleware = morgan(':method :url :status :response-time ms - :res[content-length]', {
  stream: { write: (message: string) => logger.info(message.trim()) },
});
