import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {Request, Response} from 'express';

// Single global filter for the whole app: normalizes every error to a
// {statusCode, message} body, keeps NestJS's HttpException responses intact,
// and logs server-side failures (5xx and unhandled) with request context.
// Client errors (4xx) are the caller's fault and are left unlogged to avoid
// noise. Replaces the previous console.error-based CsrfExceptionFilter.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter', {timestamp: true});

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // CSRF errors thrown by csurf (connect-compatible middleware)
    if (this.isCsrfError(exception)) {
      return response.status(HttpStatus.FORBIDDEN).json({
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Invalid CSRF token',
      });
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) {
        this.logger.error(
          `${request.method} ${request.url} → ${status}`,
          exception.stack
        );
      }
      return response.status(status).json(exception.getResponse());
    }

    // Anything else is an unhandled server error — log it in full
    this.logger.error(
      `${request.method} ${request.url} → 500 (unhandled)`,
      exception instanceof Error ? exception.stack : String(exception)
    );
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }

  private isCsrfError(exception: unknown): boolean {
    return (
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception &&
      (exception as {code?: string}).code === 'EBADCSRFTOKEN'
    );
  }
}
