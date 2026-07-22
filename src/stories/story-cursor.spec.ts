import {decodeStoryCursor, encodeStoryCursor} from './story-cursor';

describe('story cursor', () => {
  it('round-trips a key and id', () => {
    const cursor = encodeStoryCursor('2026-07-22 10:00:00.123456', 'story-1');
    expect(decodeStoryCursor(cursor)).toEqual({
      k: '2026-07-22 10:00:00.123456',
      id: 'story-1',
    });
  });

  it('round-trips a numeric key (most-commented) held as a string', () => {
    expect(decodeStoryCursor(encodeStoryCursor('42', 'story-1'))).toEqual({
      k: '42',
      id: 'story-1',
    });
  });

  it('is opaque (base64url, no raw payload)', () => {
    const cursor = encodeStoryCursor('2026-07-22 10:00:00.000000', 'story-1');
    expect(cursor).not.toContain('story-1');
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('returns null for malformed or non-cursor input', () => {
    expect(decodeStoryCursor('not-base64!!')).toBeNull();
    expect(decodeStoryCursor(Buffer.from('123').toString('base64url'))).toBeNull();
    expect(
      decodeStoryCursor(Buffer.from('{"k":"x"}').toString('base64url'))
    ).toBeNull();
  });
});
