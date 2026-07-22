// Opaque keyset cursor for the story feed. It carries the sort key of the last
// row seen plus its id (the tiebreaker), so the next page can be fetched with a
// `WHERE (sortKey, id) </> (…)` seek instead of a growing OFFSET. Base64url so
// it's URL-safe and the client treats it as opaque.
//
// The key is always a string: a full-precision `datetime(6)` string for the
// createdAt sorts (a JS Date would drop the microsecond tail and re-include the
// boundary row), or the commentCount for most-commented. The service produces
// and interprets it — this module only encodes and decodes.
export interface DecodedCursor {
  k: string;
  id: string;
}

export function encodeStoryCursor(k: string, id: string): string {
  return Buffer.from(JSON.stringify({k, id})).toString('base64url');
}

export function decodeStoryCursor(cursor: string): DecodedCursor | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8')
    );
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as DecodedCursor).k === 'string' &&
      typeof (parsed as DecodedCursor).id === 'string'
    ) {
      return parsed as DecodedCursor;
    }
    return null;
  } catch {
    return null;
  }
}
