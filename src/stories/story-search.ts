// Turns a user's search string into a Postgres to_tsquery expression for the
// story feed (title + excerpt search vector — see Story.searchVector). Each
// significant word becomes a required prefix term (`word:*`), AND-combined,
// so "haunt light" matches a story with "haunted" and "lighthouse" but not
// one missing either. Returns null when nothing indexable remains (too
// short, or only stopwords) — the caller then falls back to ILIKE.

// A floor below which a token is too short to usefully prefix-match — not
// tied to any database config, just a threshold we chose.
export const FULLTEXT_MIN_TOKEN = 3;

// A required (AND-combined) stopword would otherwise dominate the match and
// wrongly narrow or empty the results, so drop them from the query.
const STOPWORDS = new Set([
  'a',
  'about',
  'an',
  'are',
  'as',
  'at',
  'be',
  'by',
  'com',
  'de',
  'en',
  'for',
  'from',
  'how',
  'i',
  'in',
  'is',
  'it',
  'la',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'was',
  'what',
  'when',
  'where',
  'who',
  'will',
  'with',
  'und',
  'www',
]);

export function toBooleanFulltextQuery(search: string): string | null {
  const tokens = search
    .toLowerCase()
    // Split on anything that isn't a word character; this also strips
    // to_tsquery's own operators (& | ! ( ) : *) so user input can't inject
    // them.
    .split(/[^a-z0-9]+/i)
    .filter(
      (token) => token.length >= FULLTEXT_MIN_TOKEN && !STOPWORDS.has(token)
    );

  if (tokens.length === 0) return null;

  return tokens.map((token) => `${token}:*`).join(' & ');
}
