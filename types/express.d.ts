import 'express';

declare module 'express' {
  interface Request {
    // Correlation id for the request, set by requestIdMiddleware (first in the
    // chain) and echoed on the X-Request-Id response header. Always present at
    // request-handling time.
    requestId?: string;
  }
}
