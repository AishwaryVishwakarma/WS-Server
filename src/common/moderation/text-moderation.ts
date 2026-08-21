import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';

// Built once at module load: RegExpMatcher compiles the blacklist into a
// matching automaton, so it must not be reconstructed per call. This is the
// stock English profanity/slur dataset — deliberately NOT tuned for this
// site's subject matter, and deliberately NOT applied to story or comment
// text (see isProfane's callers): Whispering Shadows is a horror site, so
// "blood", "kill", "corpse", "demon", "haunted" etc. must stay allowed. It's
// scoped to identity fields only (display name, bio, tag name) — see
// CLAUDE.md "Text moderation".
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

// IsClean is applied to identity fields whose own @MaxLength is always far
// below this (the longest today is bio's 500) — a request that ignores the
// DTO's declared length still reaches every validator, since class-validator
// collects all of them rather than stopping at the first failure. Without
// this guard, an oversized payload would make the regex matcher itself do
// work proportional to attacker-controlled input size before @MaxLength's
// own rejection ever lands. Length alone already fails validation at that
// point, so skipping the scan here doesn't let anything oversized through.
const MAX_CHECKED_LENGTH = 1000;

// Word/phrase-level profanity check (normalizes leetspeak, repeated chars,
// common lookalikes, and simple punctuation-separated spellings before
// matching). Catches the common case, not every evasion — see IsClean.
export function isProfane(text: string): boolean {
  if (text.length > MAX_CHECKED_LENGTH) return false;
  return matcher.hasMatch(text);
}
