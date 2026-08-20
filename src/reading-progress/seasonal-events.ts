export interface SeasonalEvent {
  id: string;
  title: string;
  description: string;
  tagSlugs: string[];
  goal: number;
  startsAt: Date;
  endsAt: Date;
}

export function activeSeasonalEvent(now = new Date()): SeasonalEvent | null {
  const year = now.getUTCFullYear();
  const events: SeasonalEvent[] = [
    {
      id: `summer-seance-${year}`,
      title: 'Summer Séance',
      description:
        'Read three ghostly or supernatural stories before the candles go out.',
      tagSlugs: ['paranormal', 'supernatural', 'haunted-places'],
      goal: 3,
      startsAt: new Date(Date.UTC(year, 7, 1)),
      endsAt: new Date(Date.UTC(year, 8, 1)),
    },
    {
      id: `long-night-${year}`,
      title: 'The Long Night',
      description: 'Cross five dark shelves during the season of shadows.',
      tagSlugs: ['gothic', 'paranormal', 'folk-tale'],
      goal: 5,
      startsAt: new Date(Date.UTC(year, 9, 1)),
      endsAt: new Date(Date.UTC(year, 10, 1)),
    },
  ];
  return (
    events.find((event) => now >= event.startsAt && now < event.endsAt) ?? null
  );
}
