import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const status = err.status || err.statusCode || 500;
  const reqId = (req as any).requestId;

  // Always log the full error server-side (with request id for correlation).
  console.error(`[error] ${req.method} ${req.path} -> ${status}${reqId ? ` [${reqId}]` : ''}:`, err);

  // 4xx are intentional/expected — surface their message. 5xx may carry internal
  // details (stack frames, DB errors) — return a generic message in production to
  // avoid information disclosure; full detail only in development.
  const isClientError = status >= 400 && status < 500;
  const isDev = process.env.NODE_ENV === 'development';
  const message = isClientError ? (err.message || 'Request error') : 'Internal Server Error';

  res.status(status).json({
    error: message,
    ...(reqId && !isClientError ? { requestId: reqId } : {}),
    ...(isDev ? { detail: err.message, stack: err.stack } : {}),
  });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
}
