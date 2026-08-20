import {activeSeasonalEvent} from './seasonal-events';

describe('activeSeasonalEvent', () => {
  it('returns the August event inside its UTC window', () => {
    const event = activeSeasonalEvent(new Date('2026-08-20T12:00:00Z'));

    expect(event?.id).toBe('summer-seance-2026');
    expect(event?.tagSlugs).toEqual([
      'paranormal',
      'supernatural',
      'haunted-places',
    ]);
  });

  it('uses canonical catalogue slugs for the October event', () => {
    expect(
      activeSeasonalEvent(new Date('2026-10-20T12:00:00Z'))?.tagSlugs
    ).toEqual(['gothic', 'paranormal', 'folk-tale']);
  });

  it('returns null outside configured event windows', () => {
    expect(activeSeasonalEvent(new Date('2026-06-20T12:00:00Z'))).toBeNull();
  });
});
