import {computeStreakUpdate} from './streak';

describe('computeStreakUpdate', () => {
  it('starts a fresh streak at 1 on first-ever activity', () => {
    const result = computeStreakUpdate(
      {currentStreak: 0, longestStreak: 0, lastActiveDate: null},
      '2026-07-31'
    );

    expect(result).toEqual({
      currentStreak: 1,
      longestStreak: 1,
      lastActiveDate: '2026-07-31',
    });
  });

  it('extends the streak on a consecutive day', () => {
    const result = computeStreakUpdate(
      {currentStreak: 3, longestStreak: 5, lastActiveDate: '2026-07-30'},
      '2026-07-31'
    );

    expect(result).toEqual({
      currentStreak: 4,
      longestStreak: 5,
      lastActiveDate: '2026-07-31',
    });
  });

  it('is a no-op when today was already recorded', () => {
    const result = computeStreakUpdate(
      {currentStreak: 4, longestStreak: 5, lastActiveDate: '2026-07-31'},
      '2026-07-31'
    );

    expect(result).toBeNull();
  });

  it('resets to 1 (not 0) after a gap, preserving the longest streak', () => {
    const result = computeStreakUpdate(
      {currentStreak: 10, longestStreak: 10, lastActiveDate: '2026-07-20'},
      '2026-07-31'
    );

    expect(result).toEqual({
      currentStreak: 1,
      longestStreak: 10,
      lastActiveDate: '2026-07-31',
    });
  });

  it('raises the longest streak once the current one exceeds it', () => {
    const result = computeStreakUpdate(
      {currentStreak: 6, longestStreak: 6, lastActiveDate: '2026-07-30'},
      '2026-07-31'
    );

    expect(result).toEqual({
      currentStreak: 7,
      longestStreak: 7,
      lastActiveDate: '2026-07-31',
    });
  });

  it('handles a month boundary correctly (yesterday spans months)', () => {
    const result = computeStreakUpdate(
      {currentStreak: 2, longestStreak: 2, lastActiveDate: '2026-06-30'},
      '2026-07-01'
    );

    expect(result).toEqual({
      currentStreak: 3,
      longestStreak: 3,
      lastActiveDate: '2026-07-01',
    });
  });
});
