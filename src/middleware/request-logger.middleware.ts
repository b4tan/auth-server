import type { Request, Response, NextFunction } from 'express';
import logger from '@utils/logging/logger.utils.js';

export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const requestId = req.requestId || 'unknown';

  const getClientIp = (req: Request): string => {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      (req.headers['x-real-ip'] as string) ||
      req.socket.remoteAddress ||
      'unknown'
    );
  };

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const status = res.statusCode;
    const meta = {
      requestId,
      method: req.method,
      path: req.path,
      status,
      duration: `${duration}ms`,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || 'unknown',
    };

    if (status >= 500) {
      logger.error(`${req.method} ${req.path}`, undefined, meta);
    } else if (status >= 400) {
      logger.warn(`${req.method} ${req.path}`, meta);
    } else {
      logger.info(`${req.method} ${req.path}`, meta);
    }
  });

  next();
}

