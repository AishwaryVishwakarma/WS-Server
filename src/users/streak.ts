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
