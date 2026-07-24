import {isProfane} from './text-moderation';

describe('isProfane', () => {
  it('flags common profanity and slurs', () => {
    expect(isProfane('fuck')).toBe(true);
    expect(isProfane('you are a fucking idiot')).toBe(true);
    expect(isProfane('nigger')).toBe(true);
    expect(isProfane('faggot')).toBe(true);
  });

  it('flags simple obfuscations (leetspeak, single-char separators)', () => {
    expect(isProfane('sh1t')).toBe(true);
    expect(isProfane('a55hole')).toBe(true);
    expect(isProfane('fu.ck')).toBe(true);
  });

  it('does not flag clean text', () => {
    expect(isProfane('Mara Vane')).toBe(false);
    expect(isProfane('A reader of ghost stories.')).toBe(false);
  });

  // This is a horror site — dark/violent vocabulary is the genre, not abuse.
  // isProfane is scoped by callers to identity fields only (never story or
  // comment text), but it must not choke on these words regardless.
  it('does not flag horror/dark vocabulary (this is a horror site)', () => {
    const horrorWords = [
      'blood',
      'kill',
      'ghost',
      'corpse',
      'death',
      'murder',
      'demon',
      'haunted',
      'scream',
      'terror',
      'nightmare',
      'shadow',
    ];
    for (const word of horrorWords) {
      expect(isProfane(word)).toBe(false);
    }
  });
});
