import type {Request} from 'express';

export interface SessionMetadata {
  device: string;
  browser: string;
  location?: string;
  createdAt: string;
}

const header = (req: Request, name: string): string | undefined => {
  const value = req.get(name)?.trim();
  return value ? value.slice(0, 100) : undefined;
};

function deviceLabel(userAgent: string): string {
  if (/ipad|tablet/i.test(userAgent)) return 'Tablet';
  if (/mobi|android|iphone/i.test(userAgent)) return 'Mobile';
  return 'Computer';
}

function browserLabel(userAgent: string): string {
  if (/edg\//i.test(userAgent)) return 'Edge';
  if (/opr\//i.test(userAgent)) return 'Opera';
  if (/firefox\//i.test(userAgent)) return 'Firefox';
  if (/chrome\//i.test(userAgent)) return 'Chrome';
  if (/safari\//i.test(userAgent)) return 'Safari';
  return 'Unknown browser';
}

export function sessionMetadataFrom(req: Request): SessionMetadata {
  const userAgent = header(req, 'user-agent') ?? '';
  const city = header(req, 'x-vercel-ip-city');
  const region = header(req, 'x-vercel-ip-country-region');
  const country =
    header(req, 'x-vercel-ip-country') ?? header(req, 'cf-ipcountry');
  const location = [city, region, country].filter(Boolean).join(', ');

  return {
    device: deviceLabel(userAgent),
    browser: browserLabel(userAgent),
    location: location || undefined,
    createdAt: new Date().toISOString(),
  };
}
