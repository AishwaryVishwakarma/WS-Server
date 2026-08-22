import {escapeHtml, EMAIL_ACCENT_COLOR} from 'src/mail/email-template';
import type {DigestNewStory} from './digest-content';

export interface WinbackInput {
  siteUrl: string;
  newStories: DigestNewStory[];
  unreadCount: number;
}

// Builds the win-back email body from whatever's genuinely new since this
// reader was last active. Returns null when there's nothing to report — the
// caller skips sending entirely rather than mailing an empty nudge. Unlike
// digest-content.ts, this never mentions currentStreak: a lapsed reader's
// streak is already broken, so celebrating it would ring false.
export function buildWinbackText(input: WinbackInput): string | null {
  const lines: string[] = [];

  if (input.newStories.length > 0) {
    lines.push("New from authors you follow since you've been away:");
    input.newStories.forEach((story) =>
      lines.push(
        `- "${story.title}" by ${story.authorName} — ${input.siteUrl}/stories/${story.id}`
      )
    );
  }

  if (input.unreadCount > 0) {
    lines.push(
      `You have ${input.unreadCount} unread notification${
        input.unreadCount === 1 ? '' : 's'
      } waiting.`
    );
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

// HTML counterpart to buildWinbackText, sharing the exact same branching so
// the two are only ever both-null or both-non-null.
export function buildWinbackHtml(input: WinbackInput): string | null {
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
      '<p style="margin:0 0 10px; font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#777681;">New since you\'ve been away</p>' +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px; border:1px solid #34343d; border-radius:10px; background:#222229;">${items}</table>`
    );
  }

  if (input.unreadCount > 0) {
    sections.push(
      `<p style="margin:0;">You have <strong style="color:#ededf0;">${input.unreadCount}</strong> unread notification${
        input.unreadCount === 1 ? '' : 's'
      } waiting.</p>`
    );
  }

  return sections.length > 0 ? sections.join('') : null;
}
