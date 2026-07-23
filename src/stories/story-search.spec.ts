import {toBooleanFulltextQuery} from './story-search';

describe('toBooleanFulltextQuery', () => {
  it('makes each significant word a required prefix term', () => {
    expect(toBooleanFulltextQuery('haunted lighthouse')).toBe(
      '+haunted* +lighthouse*'
    );
  });

  it('lowercases and collapses punctuation/whitespace', () => {
    expect(toBooleanFulltextQuery("  The  Keeper's   Desk! ")).toBe(
      '+keeper* +desk*'
    );
  });

  it('drops stopwords and sub-min-length tokens', () => {
    // "the" is a stopword and "ax" is under the 3-char minimum; "axe" survives.
    expect(toBooleanFulltextQuery('the ax axe')).toBe('+axe*');
  });

  it('strips boolean operators so they cannot be injected', () => {
    expect(toBooleanFulltextQuery('+ghost* -house "phrase"')).toBe(
      '+ghost* +house* +phrase*'
    );
  });

  it('returns null when nothing indexable remains', () => {
    expect(toBooleanFulltextQuery('%')).toBeNull();
    expect(toBooleanFulltextQuery('a of to')).toBeNull();
    expect(toBooleanFulltextQuery('  ')).toBeNull();
  });
});
