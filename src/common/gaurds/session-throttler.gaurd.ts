import {Injectable} from '@nestjs/common';
import {ThrottlerGuard} from '@nestjs/throttler';
import type {Request} from 'express';

// The frontend proxies every request through its own origin, so to the API
// all traffic shares the proxy's IP — plain IP throttling would be one bucket
// for everyone. Track authenticated requests by user id instead, so limits
// are per-account; fall back to IP (honouring X-Forwarded-For via the app's
// trust-proxy setting) for anonymous traffic.
@Injectable()
export class SessionThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Request): Promise<string> {
    const userId = req.session?.userId;
    return Promise.resolve(userId ? `user:${userId}` : `ip:${req.ip}`);
  }
}
