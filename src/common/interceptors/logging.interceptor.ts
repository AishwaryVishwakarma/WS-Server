import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import {Request, Response} from 'express';
import {Observable} from 'rxjs';
import {tap} from 'rxjs/operators';

// Logs one line per request: METHOD /url → status (Xms). Health probes are
// skipped so orchestrator polling and the long-lived notification stream don't
// flood the log. Errors are still logged by AllExceptionsFilter.
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP', {timestamp: true});

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();

    const path =
      request.originalUrl?.split('?')[0] ?? request.url.split('?')[0];
    if (path === '/health' || path === '/users/me/notifications/stream') {
      return next.handle();
    }

    const {method, url, requestId} = request;
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const response = http.getResponse<Response>();
        this.logger.log(
          `[${requestId}] ${method} ${url} → ${response.statusCode} (${Date.now() - start}ms)`
        );
      })
    );
  }
}
