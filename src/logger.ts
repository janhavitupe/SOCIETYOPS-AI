import { Request, Response, NextFunction, RequestHandler } from 'express';
import winston from 'winston';
import morgan from 'morgan';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'societyops-api' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
          return `${timestamp} [${level}]: ${message} ${metaStr}`;
        })
      ),
    }),
  ],
});

morgan.token('message', (req) => (req as any).message || '');

export const morganMiddleware = morgan(
  ':method :url :status :response-time ms - :res[content-length] - :message',
  { stream: { write: (message: string) => logger.info(message.trim()) } }
);

// Express 4 does not catch rejected promises from async handlers: the rejection
// never reaches the error middleware and the request hangs until the client
// times out. Every async route is registered through this wrapper instead.
type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export const route = (handler: AsyncRouteHandler): RequestHandler => (req, res, next) => {
  handler(req, res, next).catch(next);
};
