export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
}

// UTC calendar-day arithmetic — the whole point of storing lastActiveDate as
// a plain 'YYYY-MM-DD' string is that "yesterday" is just string date math,
// no timezone-aware Date comparison anywhere.
function yesterday(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Patron+ perk: a banked freeze silently protects one missed day instead of
// the streak resetting. Checked lazily inside UsersService.recordActivity —
// mirrors this file's own "no scheduler, just recompute on next activity"
// approach rather than a daily cron.
export const MAX_STREAK_FREEZES = 1;
export const STREAK_FREEZE_REPLENISH_DAYS = 30;

// lastStreakFreezeUsedAt doubles as "last time this token slot was touched"
// (granted or spent) — both events restart the same 30-day clock, so one
// field covers it without a third column.
export function isEligibleForFreezeGrant(
  streakFreezeCount: number,
  lastStreakFreezeUsedAt: Date | null,
  now: Date
): boolean {
  if (streakFreezeCount >= MAX_STREAK_FREEZES) return false;
  if (!lastStreakFreezeUsedAt) return true;
  const daysSince =
    (now.getTime() - lastStreakFreezeUsedAt.getTime()) / 86_400_000;
  return daysSince >= STREAK_FREEZE_REPLENISH_DAYS;
}

// True when exactly one calendar day was missed — the specific gap size a
// freeze protects (a longer gap means the streak had already lapsed before
// today, which a single freeze isn't meant to paper over).
export function isOneDayGap(lastActiveDate: string, today: string): boolean {
  return yesterday(yesterday(today)) === lastActiveDate;
}

// Spends a freeze: returns `state` with lastActiveDate bumped forward one
// day, so computeStreakUpdate reads the gap as consecutive instead of
// resetting. Keeps the "pretend yesterday was active" trick — and the date
// arithmetic behind it — inside this module rather than leaking `yesterday`.
export function applyFreeze(state: StreakState, today: string): StreakState {
  return {...state, lastActiveDate: yesterday(today)};
}

// Returns the updated streak state after activity on `today`, or null if
// today was already recorded (a genuine no-op — recordView can fire many
// times a day). A gap of more than one day resets currentStreak to 1 rather
// than 0, since today's own activity itself starts a new streak.
export function computeStreakUpdate(
  state: StreakState,
  today: string
): StreakState | null {
  if (state.lastActiveDate === today) return null;

  const isConsecutive = state.lastActiveDate === yesterday(today);
  const currentStreak = isConsecutive ? state.currentStreak + 1 : 1;

  return {
    currentStreak,
    longestStreak: Math.max(state.longestStreak, currentStreak),
    lastActiveDate: today,
  };
}
