import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {timingSafeEqual} from 'crypto';
import type {Request} from 'express';

// Guards GET /metrics with a static bearer token. Fail-closed: if METRICS_TOKEN
// is unset (allowed outside production), every scrape is denied rather than the
// endpoint being left open. In production the token is required at boot by
// ConfigModule.validate, so this can only pass with the right credential.
//
// (Spelled `guard` correctly — the repo's `gaurd` typo is confined to the
// existing src/common/gaurds/ directory; no need to spread it to a new module.)
@Injectable()
export class MetricsTokenGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.configService.get<string>('METRICS_TOKEN');
    if (!expected) {
      throw new UnauthorizedException('Metrics endpoint is not configured');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    const provided = header?.startsWith('Bearer ')
      ? header.slice('Bearer '.length)
      : undefined;

    if (!provided || !this.tokensMatch(provided, expected)) {
      throw new UnauthorizedException('Invalid metrics token');
    }
    return true;
  }

  // Constant-time comparison so a wrong token can't be recovered byte-by-byte
  // from response-timing differences. Unequal lengths short-circuit (that only
  // reveals length, not content).
  private tokensMatch(provided: string, expected: string): boolean {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
