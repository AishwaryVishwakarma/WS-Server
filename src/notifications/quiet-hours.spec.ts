import {quietHoursDelay} from './notifications.service';

describe('quietHoursDelay', () => {
  it('delays across a midnight quiet window in the member local time', () => {
    // 18:00 UTC +05:30 = 23:30 local; deliver at 07:00 local.
    expect(
      quietHoursDelay(new Date('2026-08-14T18:00:00Z'), '22:00', '07:00', 330)
    ).toBe(450 * 60_000);
  });

  it('does not delay outside quiet hours', () => {
    expect(
      quietHoursDelay(new Date('2026-08-14T08:00:00Z'), '22:00', '07:00', 330)
    ).toBe(0);
  });

  it('treats equal start and end as disabled', () => {
    expect(
      quietHoursDelay(new Date('2026-08-14T18:00:00Z'), '22:00', '22:00', 330)
    ).toBe(0);
  });
});
