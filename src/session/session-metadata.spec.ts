import type {Request} from 'express';
import {sessionMetadataFrom} from './session-metadata';

const requestWithHeaders = (headers: Record<string, string> = {}) =>
  ({
    get: (name: string) => headers[name.toLowerCase()],
    ip: headers.ip,
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

  it('falls back to IP geolocation when provider headers are absent', () => {
    const lookup = jest.fn().mockReturnValue('Pune, Maharashtra, India');

    expect(
      sessionMetadataFrom(requestWithHeaders({ip: '203.0.113.2'}), {lookup})
        .location
    ).toBe('Pune, Maharashtra, India');
    expect(lookup).toHaveBeenCalledWith('203.0.113.2');
  });

  it('prefers trusted provider location headers over an IP lookup', () => {
    const lookup = jest.fn();
    const metadata = sessionMetadataFrom(
      requestWithHeaders({'x-vercel-ip-country': 'IN', ip: '203.0.113.2'}),
      {lookup}
    );

    expect(metadata.location).toBe('IN');
    expect(lookup).not.toHaveBeenCalled();
  });
});
