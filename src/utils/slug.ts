import {randomBytes} from 'crypto';

const MAX_SLUG_TEXT_LENGTH = 80;
const SHORT_ID_LENGTH = 8;
// Excludes visually-ambiguous characters (0/o, 1/l/i) so a manually-typed
// or read-aloud URL doesn't misfire.
const SHORT_ID_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length <= MAX_SLUG_TEXT_LENGTH) {
    return slug;
  }

  const truncated = slug.slice(0, MAX_SLUG_TEXT_LENGTH);
  const lastHyphen = truncated.lastIndexOf('-');
  return lastHyphen > 0 ? truncated.slice(0, lastHyphen) : truncated;
}

export function shortId(): string {
  const bytes = randomBytes(SHORT_ID_LENGTH);
  let id = '';
  for (let i = 0; i < SHORT_ID_LENGTH; i++) {
    id += SHORT_ID_ALPHABET[bytes[i] % SHORT_ID_ALPHABET.length];
  }
  return id;
}

export function buildSlug(text: string, fallback = 'item'): string {
  const base = slugify(text) || fallback;
  return `${base}-${shortId()}`;
}
