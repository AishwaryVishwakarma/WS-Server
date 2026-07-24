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

// Word/phrase-level profanity check (normalizes leetspeak, repeated chars,
// common lookalikes, and simple punctuation-separated spellings before
// matching). Catches the common case, not every evasion — see IsClean.
export function isProfane(text: string): boolean {
  return matcher.hasMatch(text);
}
