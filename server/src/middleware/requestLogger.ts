import { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const userId = (req as any).user?.id || 'anonymous';
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms [user:${userId}]`);
  });
  next();
}
