import type {NextFunction, Request, Response} from 'express';
import type {MetricsService} from 'src/metrics/metrics.service';

// The scrape and probe endpoints are excluded so they don't inflate their own
// series or add noise to latency percentiles.
const EXCLUDED_PATHS = new Set(['/metrics', '/health']);

// Records one HTTP observation per request on response 'finish', when the
// status code is final (including errors normalized by AllExceptionsFilter and
// requests rejected in middleware before a handler runs). Labelled by the
// matched route *template* (req.route.path, e.g. /stories/:id) — never the raw
// URL — so path parameters can't explode label cardinality.
export function createHttpMetricsMiddleware(metrics: MetricsService) {
  return function httpMetricsMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    if (EXCLUDED_PATHS.has(req.path)) {
      return next();
    }

    const start = process.hrtime.bigint();
    metrics.incInFlight();

    res.on('finish', () => {
      const durationSeconds =
        Number(process.hrtime.bigint() - start) / 1_000_000_000;
      // req.route is loosely typed (any); narrow it and fall back for
      // unmatched paths so raw URLs never become label values.
      const routePath = (req.route as {path?: string} | undefined)?.path;
      const route = typeof routePath === 'string' ? routePath : 'unmatched';
      metrics.observeHttp(req.method, route, res.statusCode, durationSeconds);
    });

    next();
  };
}
