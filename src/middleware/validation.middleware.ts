import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import logger from '@utils/logging/logger.utils.js';

type RequestSegment = 'body' | 'query' | 'params';

// Schema validation middleware
class ValidationMiddleware {
  static validate(schema: z.ZodTypeAny, prop: RequestSegment = 'body') {
    return (req: Request, res: Response, next: NextFunction) => {
      const result = schema.safeParse(req[prop]);
      if (!result.success) {
        logger.debug("Validation failed", {
          requestId: req.requestId,
          method: req.method,
          path: req.path,
          prop,
          errors: result.error.issues.map(issue => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
        return res.status(400).json({ title: "Bad Request", details: result.error.format() });
      }
      req.body = result.data; // override the request body with the validated data
      next();
    };
  }
}
export default ValidationMiddleware;
