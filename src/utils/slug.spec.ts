import {buildSlug, shortId, slugify} from './slug';

describe('slugify', () => {
  it('lowercases and hyphenates non-alphanumeric runs', () => {
    expect(slugify('The Stepwell That Counted Back')).toBe(
      'the-stepwell-that-counted-back'
    );
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  --Hello, World!--  ')).toBe('hello-world');
  });

  it('truncates long text at a word boundary', () => {
    const longTitle = Array.from({length: 20}, (_, i) => `word${i}`).join(' ');

    const slug = slugify(longTitle);

    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('returns an empty string for all-punctuation input', () => {
    expect(slugify('!!! 🎃 !!!')).toBe('');
  });
});

describe('shortId', () => {
  it('generates an 8-character id from the ambiguity-free alphabet', () => {
    const id = shortId();

    expect(id).toHaveLength(8);
    expect(id).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]+$/);
  });

  it('is not deterministic across calls', () => {
    expect(shortId()).not.toBe(shortId());
  });
});

describe('buildSlug', () => {
  it('appends a random suffix to the slugified text', () => {
    const slug = buildSlug('The Last Light');

    expect(slug).toMatch(/^the-last-light-[23456789a-z]{8}$/);
  });

  it('falls back to the given base when the text has no usable characters', () => {
    const slug = buildSlug('🎃🎃🎃', 'story');

    expect(slug).toMatch(/^story-[23456789a-z]{8}$/);
  });
});
