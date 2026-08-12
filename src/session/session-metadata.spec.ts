import type {Request} from 'express';
import {sessionMetadataFrom} from './session-metadata';

const requestWithHeaders = (headers: Record<string, string> = {}) =>
  ({
    get: (name: string) => headers[name.toLowerCase()],
  }) as Request;

describe('sessionMetadataFrom', () => {
  it('uses safe defaults when optional request metadata is absent', () => {
    expect(sessionMetadataFrom(requestWithHeaders())).toEqual(
      expect.objectContaining({
        device: 'Computer',
        browser: 'Unknown browser',
        location: undefined,
      })
    );
  });

  it('derives device, browser, and approximate location from headers', () => {
    const metadata = sessionMetadataFrom(
      requestWithHeaders({
        'user-agent':
          'Mozilla/5.0 (iPhone) AppleWebKit/537.36 Chrome/124.0 Mobile',
        'x-vercel-ip-city': 'Pune',
        'x-vercel-ip-country-region': 'MH',
        'x-vercel-ip-country': 'IN',
      })
    );

    expect(metadata).toEqual(
      expect.objectContaining({
        device: 'Mobile',
        browser: 'Chrome',
        location: 'Pune, MH, IN',
      })
    );
  });
});
