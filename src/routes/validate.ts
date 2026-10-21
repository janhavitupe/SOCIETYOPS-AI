import { Request, Response, NextFunction, RequestHandler } from 'express';
import { z } from 'zod';

type Part = 'body' | 'query' | 'params';

function formatIssues(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

/**
 * Parses one part of the request against a schema and replaces it with the
 * parsed value, so handlers only ever see validated, typed, stripped input.
 *
 * Replaces xss-clean and hpp: unknown keys are dropped, repeated query keys
 * (which arrive as arrays) fail the string schemas, and HTML is escaped where
 * it is rendered rather than mangled on the way in.
 */
function validatePart(part: Part, schema: z.ZodType): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[part] ?? {});
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid request', details: formatIssues(result.error) });
    }
    // Express 5 exposes req.query through a getter on the prototype, so it
    // cannot be assigned; an own property shadows it for this request.
    Object.defineProperty(req, part, { value: result.data, writable: true, configurable: true, enumerable: true });
    next();
  };
}

export const validateBody = (schema: z.ZodType) => validatePart('body', schema);
export const validateQuery = (schema: z.ZodType) => validatePart('query', schema);
export const validateParams = (schema: z.ZodType) => validatePart('params', schema);
