// Turns a user's search string into a MySQL FULLTEXT boolean-mode query for the
// story feed (title + excerpt index). Each significant word becomes a required
// prefix term (`+word*`), so "haunt light" matches a story with "haunted" and
// "lighthouse" but not one missing either. Returns null when nothing indexable
// remains (too short, or only stopwords) — the caller then falls back to LIKE.

// InnoDB won't index tokens shorter than innodb_ft_min_token_size (default 3),
// so shorter words can't be matched via FULLTEXT.
export const FULLTEXT_MIN_TOKEN = 3;

// InnoDB's default stopword list (innodb_ft_default_stopword). A required (`+`)
// stopword in boolean mode matches nothing, which would wrongly empty the
// results, so drop them from the query.
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
    // Split on anything that isn't a word character; this also strips the
    // boolean operators (+ - * " ( ) ~ < > @) so user input can't inject them.
    .split(/[^a-z0-9]+/i)
    .filter(
      (token) => token.length >= FULLTEXT_MIN_TOKEN && !STOPWORDS.has(token)
    );

  if (tokens.length === 0) return null;

  return tokens.map((token) => `+${token}*`).join(' ');
}
