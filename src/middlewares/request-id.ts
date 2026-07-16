import {randomUUID} from 'node:crypto';
import type {NextFunction, Request, Response} from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

// A conservative shape for an id we're willing to trust from upstream: short,
// and free of anything that could forge a log line or a response header.
const SAFE_REQUEST_ID = /^[\w-]{1,64}$/;

// First middleware in the chain: give every request a correlation id. Honour an
// id supplied by a trusted upstream (the Next.js /api proxy / reverse proxy) so
// a single request can be traced end-to-end, but only if it passes a strict
// pattern — otherwise generate one. The id is stashed on req.requestId (logged
// by LoggingInterceptor / AllExceptionsFilter) and echoed on the response so
// clients and proxies can correlate.
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const requestId =
    typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming)
      ? incoming
      : randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
