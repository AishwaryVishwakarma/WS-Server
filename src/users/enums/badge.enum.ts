// Achievement badges shown on an author's public profile. Computed on read
// (UsersService.computeBadges) from stats that already exist elsewhere
// (approved story count, likes/comments received, series ownership) — none
// of these are stored columns, so there's no trigger/recompute plumbing to
// keep in sync as content is created, liked, or commented on.
export enum Badge {
  Published = 'published',
  Prolific = 'prolific',
  FanFavorite = 'fan-favorite',
  ConversationStarter = 'conversation-starter',
  SeriesAuthor = 'series-author',
  // Based on User.longestStreak (see streak.ts) — permanent once earned,
  // like every badge above, so a lapsed streak doesn't take it away.
  WeekStreak = 'week-streak',
  MonthStreak = 'month-streak',
}
