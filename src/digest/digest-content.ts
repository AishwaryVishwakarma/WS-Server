export interface DigestNewStory {
  title: string;
  id: string;
  authorName: string;
}

import {escapeHtml, EMAIL_ACCENT_COLOR} from 'src/mail/email-template';

export interface DigestInput {
  siteUrl: string;
  currentStreak: number;
  newStories: DigestNewStory[];
  unreadCount: number;
}

// Builds the weekly digest email body from whatever's genuinely new for
// this reader. Returns null when there's nothing to report — the caller
// skips sending entirely rather than mailing a "nothing happened this
// week" message.
export function buildDigestText(input: DigestInput): string | null {
  const lines: string[] = [];

  if (input.newStories.length > 0) {
    lines.push('New from authors you follow:');
    input.newStories.forEach((story) =>
      lines.push(
        `- "${story.title}" by ${story.authorName} — ${input.siteUrl}/stories/${story.id}`
      )
    );
  }

  if (input.currentStreak > 0) {
    lines.push(
      `You're on a ${input.currentStreak}-day reading streak. Keep it going.`
    );
  }

  if (input.unreadCount > 0) {
    lines.push(
      `You have ${input.unreadCount} unread notification${
        input.unreadCount === 1 ? '' : 's'
      }.`
    );
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

// HTML counterpart to buildDigestText, sharing the exact same branching so
// the two are only ever both-null or both-non-null. Story titles/author
// names are user-authored — always escape them.
export function buildDigestHtml(input: DigestInput): string | null {
  const sections: string[] = [];

  if (input.newStories.length > 0) {
    const items = input.newStories
      .map((story) => {
        const url = `${escapeHtml(input.siteUrl)}/stories/${escapeHtml(story.id)}`;
        return (
          `<li style="margin:0 0 8px;">` +
          `<a href="${url}" style="color:${EMAIL_ACCENT_COLOR}; text-decoration:none;">` +
          `"${escapeHtml(story.title)}"</a> by ${escapeHtml(story.authorName)}` +
          `</li>`
        );
      })
      .join('');
    sections.push(
      '<p style="margin:0 0 8px; font-weight:600;">New from authors you follow</p>' +
        `<ul style="margin:0 0 20px; padding-left:20px;">${items}</ul>`
    );
  }

  if (input.currentStreak > 0) {
    sections.push(
      `<p style="margin:0 0 12px;">You're on a <strong>${input.currentStreak}-day</strong> reading streak. Keep it going.</p>`
    );
  }

  if (input.unreadCount > 0) {
    sections.push(
      `<p style="margin:0;">You have <strong>${input.unreadCount}</strong> unread notification${
        input.unreadCount === 1 ? '' : 's'
      }.</p>`
    );
  }

  return sections.length > 0 ? sections.join('') : null;
}
