import {buildDigestText, buildDigestHtml} from './digest-content';

const BASE = {
  siteUrl: 'https://example.test',
  currentStreak: 0,
  newStories: [],
  unreadCount: 0,
};

describe('buildDigestText', () => {
  it('returns null when there is nothing to report', () => {
    expect(buildDigestText(BASE)).toBeNull();
  });

  it('reports a streak on its own', () => {
    const text = buildDigestText({...BASE, currentStreak: 4});
    expect(text).toBe("You're on a 4-day reading streak. Keep it going.");
  });

  it('reports new stories on their own', () => {
    const text = buildDigestText({
      ...BASE,
      newStories: [{id: 'story-1', title: 'The Attic', authorName: 'Mara'}],
    });
    expect(text).toBe(
      'New from authors you follow:\n- "The Attic" by Mara — https://example.test/stories/story-1'
    );
  });

  it('reports an unread count with correct singular/plural wording', () => {
    expect(buildDigestText({...BASE, unreadCount: 1})).toBe(
      'You have 1 unread notification.'
    );
    expect(buildDigestText({...BASE, unreadCount: 3})).toBe(
      'You have 3 unread notifications.'
    );
  });

  it('combines all three sections in order when all are present', () => {
    const text = buildDigestText({
      siteUrl: 'https://example.test',
      currentStreak: 2,
      newStories: [{id: 's1', title: 'Hollow', authorName: 'Aria'}],
      unreadCount: 5,
    });

    expect(text).toBe(
      [
        'New from authors you follow:',
        '- "Hollow" by Aria — https://example.test/stories/s1',
        "You're on a 2-day reading streak. Keep it going.",
        'You have 5 unread notifications.',
      ].join('\n')
    );
  });
});

describe('buildDigestHtml', () => {
  it('returns null when there is nothing to report (mirrors buildDigestText)', () => {
    expect(buildDigestHtml(BASE)).toBeNull();
  });

  it('reports a streak on its own', () => {
    const html = buildDigestHtml({...BASE, currentStreak: 4});
    expect(html).toContain('4-day');
    expect(html).toContain('Keep it going.');
  });

  it('reports an unread count with correct singular/plural wording', () => {
    expect(buildDigestHtml({...BASE, unreadCount: 1})).toContain(
      'unread notification.'
    );
    expect(buildDigestHtml({...BASE, unreadCount: 3})).toContain(
      'unread notifications.'
    );
  });

  it('links to each new story and escapes user-authored title/author text', () => {
    const html = buildDigestHtml({
      ...BASE,
      newStories: [
        {
          id: 'story-1',
          title: '<script>alert(1)</script>',
          authorName: 'Mara & Co',
        },
      ],
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Mara &amp; Co');
    expect(html).toContain('href="https://example.test/stories/story-1"');
  });
});
