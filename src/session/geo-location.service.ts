import {Injectable, Logger, OnModuleInit} from '@nestjs/common';
import {isIP} from 'node:net';
import {open, type CityResponse, type Reader} from 'maxmind';

const DEFAULT_DATABASE_PATH = '/usr/share/GeoIP/GeoLite2-City.mmdb';

const normalizeIp = (ip: string): string =>
  ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;

const isPrivateIp = (ip: string): boolean => {
  if (ip === '::1' || ip === '127.0.0.1') return true;
  if (isIP(ip) === 4) {
    const [first, second] = ip.split('.').map(Number);
    return (
      first === 10 ||
      first === 127 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }
  return ip === '::' || ip.startsWith('fc') || ip.startsWith('fd');
};

@Injectable()
export class GeoLocationService implements OnModuleInit {
  private readonly logger = new Logger(GeoLocationService.name);
  private reader?: Reader<CityResponse>;

  async onModuleInit(): Promise<void> {
    const path = process.env.GEOIP_DATABASE_PATH || DEFAULT_DATABASE_PATH;
    try {
      this.reader = await open<CityResponse>(path);
      this.logger.log(`Loaded GeoLite2 City database from ${path}`);
    } catch {
      this.logger.warn(
        `GeoLite2 City database unavailable at ${path}; session location will use proxy headers only`
      );
    }
  }

  lookup(rawIp: string | undefined): string | undefined {
    if (!rawIp) return undefined;
    const ip = normalizeIp(rawIp.trim());
    if (!isIP(ip)) return undefined;
    if (isPrivateIp(ip)) return 'Local network';

    const result = this.reader?.get(ip);
    if (!result) return undefined;

    const city = result.city?.names?.en;
    const region = result.subdivisions?.[0]?.names?.en;
    const country = result.country?.names?.en;
    return [city, region, country].filter(Boolean).join(', ') || undefined;
  }
}
