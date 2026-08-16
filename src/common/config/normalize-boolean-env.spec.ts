import {normalizeBooleanEnv} from './normalize-boolean-env';

describe('normalizeBooleanEnv', () => {
  it.each([
    ['true', 'true'],
    ['false', 'false'],
    [' FALSE ', 'false'],
    ['"false"', 'false'],
    ["'true'", 'true'],
    [true, 'true'],
    [false, 'false'],
  ])('normalizes %p to %s', (input, expected) => {
    expect(normalizeBooleanEnv('FEATURE_ENABLED', input)).toBe(expected);
  });

  it('leaves an absent optional value undefined', () => {
    expect(normalizeBooleanEnv('FEATURE_ENABLED', undefined)).toBeUndefined();
  });

  it('rejects values that are not boolean-like and reports what arrived', () => {
    expect(() => normalizeBooleanEnv('FEATURE_ENABLED', 'enabled')).toThrow(
      'FEATURE_ENABLED must be true or false; received "enabled" (string)'
    );
  });

  it('rejects non-string values without using object stringification', () => {
    expect(() => normalizeBooleanEnv('FEATURE_ENABLED', {})).toThrow(
      'FEATURE_ENABLED must be true or false; received type object'
    );
  });
});
