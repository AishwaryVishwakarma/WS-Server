import {Injectable} from '@nestjs/common';
import type {Request} from 'express';

@Injectable()
export class SessionService {
  regenerate(req: Request): Promise<void> {
    return new Promise((resolve, reject) => {
      req.session.regenerate((err: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  destroy(req: Request): Promise<void> {
    return new Promise((resolve, reject) => {
      req.session.destroy((err: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
