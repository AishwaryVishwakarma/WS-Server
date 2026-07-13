import {Injectable, NestMiddleware} from '@nestjs/common';
import type {NextFunction, Request, Response} from 'express';
import {doubleCsrfProtection} from './csrf';

@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    return doubleCsrfProtection(req, res, next);
  }
}
