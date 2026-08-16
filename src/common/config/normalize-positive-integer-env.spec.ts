import {normalizePositiveIntegerEnv} from './normalize-positive-integer-env';

describe('normalizePositiveIntegerEnv', () => {
  it.each([
    ['500', '500'],
    [' 500 ', '500'],
    ['"500"', '500'],
    ["'500'", '500'],
    [500, '500'],
    ['0005', '5'],
  ])('normalizes %p to %s', (input, expected) => {
    expect(normalizePositiveIntegerEnv('LIMIT', input)).toBe(expected);
  });

  it.each([undefined, null, '', '  ', '""'])('treats %p as unset', (input) => {
    expect(normalizePositiveIntegerEnv('LIMIT', input)).toBeUndefined();
  });

  it.each(['0', '-1', '1.5', '500ms', 'NaN'])('rejects %p', (input) => {
    expect(() => normalizePositiveIntegerEnv('LIMIT', input)).toThrow(
      'LIMIT must be a positive integer'
    );
  });

  it('rejects non-string and non-number values safely', () => {
    expect(() => normalizePositiveIntegerEnv('LIMIT', {})).toThrow(
      'LIMIT must be a positive integer; received type object'
    );
  });
});
