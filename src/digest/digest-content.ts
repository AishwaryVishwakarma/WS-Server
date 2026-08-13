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
          `<tr><td style="padding:14px 16px; border-bottom:1px solid #34343d;">` +
          `<a href="${url}" style="display:block; color:${EMAIL_ACCENT_COLOR}; font-weight:700; text-decoration:none;">` +
          `${escapeHtml(story.title)}</a>` +
          `<span style="display:block; margin-top:3px; font-size:13px; color:#a6a5af;">by ${escapeHtml(story.authorName)}</span>` +
          `</td></tr>`
        );
      })
      .join('');
    sections.push(
      '<p style="margin:0 0 10px; font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#777681;">New from authors you follow</p>' +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px; border:1px solid #34343d; border-radius:10px; background:#222229;">${items}</table>`
    );
  }

  if (input.currentStreak > 0) {
    sections.push(
      `<p style="margin:0 0 12px; padding:14px 16px; border-left:3px solid ${EMAIL_ACCENT_COLOR}; background:#222229;">You're on a <strong style="color:#ededf0;">${input.currentStreak}-day reading streak</strong>. Keep it going.</p>`
    );
  }

  if (input.unreadCount > 0) {
    sections.push(
      `<p style="margin:0;">You have <strong style="color:#ededf0;">${input.unreadCount}</strong> unread notification${
        input.unreadCount === 1 ? '' : 's'
      }.</p>`
    );
  }

  return sections.length > 0 ? sections.join('') : null;
}
