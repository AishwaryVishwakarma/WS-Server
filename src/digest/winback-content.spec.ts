import {buildWinbackText, buildWinbackHtml} from './winback-content';

const BASE = {
  siteUrl: 'https://example.test',
  newStories: [],
  unreadCount: 0,
};

describe('buildWinbackText', () => {
  it('returns null when there is nothing to report', () => {
    expect(buildWinbackText(BASE)).toBeNull();
  });

  it('reports new stories on their own', () => {
    const text = buildWinbackText({
      ...BASE,
      newStories: [{id: 'story-1', title: 'The Attic', authorName: 'Mara'}],
    });
    expect(text).toBe(
      "New from authors you follow since you've been away:\n" +
        '- "The Attic" by Mara — https://example.test/stories/story-1'
    );
  });

  it('reports an unread count with correct singular/plural wording', () => {
    expect(buildWinbackText({...BASE, unreadCount: 1})).toBe(
      'You have 1 unread notification waiting.'
    );
    expect(buildWinbackText({...BASE, unreadCount: 3})).toBe(
      'You have 3 unread notifications waiting.'
    );
  });

  it('never mentions a reading streak, unlike the weekly digest', () => {
    const text = buildWinbackText({...BASE, unreadCount: 1});
    expect(text).not.toContain('streak');
  });

  it('combines both sections in order when both are present', () => {
    const text = buildWinbackText({
      siteUrl: 'https://example.test',
      newStories: [{id: 's1', title: 'Hollow', authorName: 'Aria'}],
      unreadCount: 5,
    });

    expect(text).toBe(
      [
        "New from authors you follow since you've been away:",
        '- "Hollow" by Aria — https://example.test/stories/s1',
        'You have 5 unread notifications waiting.',
      ].join('\n')
    );
  });
});

describe('buildWinbackHtml', () => {
  it('returns null when there is nothing to report (mirrors buildWinbackText)', () => {
    expect(buildWinbackHtml(BASE)).toBeNull();
  });

  it('reports an unread count with correct singular/plural wording', () => {
    expect(buildWinbackHtml({...BASE, unreadCount: 1})).toContain(
      'unread notification waiting.'
    );
    expect(buildWinbackHtml({...BASE, unreadCount: 3})).toContain(
      'unread notifications waiting.'
    );
  });

  it('links to each new story and escapes user-authored title/author text', () => {
    const html = buildWinbackHtml({
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
    expect(html).toContain('role="presentation"');
  });
});
