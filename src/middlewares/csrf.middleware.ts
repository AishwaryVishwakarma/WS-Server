import {Injectable, NestMiddleware} from '@nestjs/common';
import * as csurf from 'csurf';
import type {NextFunction, Request, Response} from 'express';

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  private readonly csrfProtection = csurf({
    cookie: false,
    value: (req: Request) => req.headers['x-csrf-token'] as string,
  });

  use(req: Request, res: Response, next: NextFunction) {
    return this.csrfProtection(req, res, next);
  }
}
