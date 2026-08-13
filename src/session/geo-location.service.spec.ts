import {GeoLocationService} from './geo-location.service';

describe('GeoLocationService', () => {
  it.each(['127.0.0.1', '::1', '192.168.1.8', '10.0.0.4'])(
    'labels private address %s as local',
    (ip) => {
      expect(new GeoLocationService().lookup(ip)).toBe('Local network');
    }
  );

  it('returns undefined for malformed or unknown public addresses', () => {
    const service = new GeoLocationService();
    expect(service.lookup('not-an-ip')).toBeUndefined();
    expect(service.lookup('203.0.113.2')).toBeUndefined();
  });
});
