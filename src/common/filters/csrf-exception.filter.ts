import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import {Response} from 'express';

@Catch()
export class CsrfExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // Detect CSRF errors thrown by `csurf` (connect-compatible)
    if (
      typeof exception === 'object' &&
      exception !== null &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (exception as any).code === 'EBADCSRFTOKEN'
    ) {
      return response.status(403).json({
        statusCode: 403,
        message: 'Invalid CSRF token',
      });
    }

    // Default behavior (let NestJS handle other exceptions)
    if (exception instanceof HttpException) {
      return response
        .status(exception.getStatus())
        .json(exception.getResponse());
    }

    console.error('Unhandled Exception:', exception);
    return response.status(500).json({
      statusCode: 500,
      message: 'Internal server error',
    });
  }
}
