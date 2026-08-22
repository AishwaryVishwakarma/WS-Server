import {Injectable, NotFoundException} from '@nestjs/common';
import {
  escapeHtml,
  EMAIL_ACCENT_COLOR,
  renderEmailHtml,
} from './email-template';
import {buildDigestHtml} from 'src/digest/digest-content';
import {buildWinbackHtml} from 'src/digest/winback-content';
import type {MailPreviewSummary} from './mail-preview.types';

const SITE_URL = 'https://www.whisperingshadows.net';

interface NotificationSample {
  subject: string;
  action: string;
  actorName: string;
  storySlug: string | null;
  commentId: string | null;
  actorSlug: string;
  storyTitle: string | null;
}

const NOTIFICATION_SAMPLES: Record<string, NotificationSample> = {
  reply: {
    subject: 'A new reply in the shadows',
    action: 'replied to your comment',
    actorName: 'Corin Blackwood',
    storySlug: 'the-attic-door-x9k2',
    commentId: 'c-102',
    actorSlug: 'corin-blackwood',
    storyTitle: 'The Attic Door',
  },
  comment: {
    subject: 'A new comment on your story',
    action: 'commented on your story',
    actorName: 'Juniper Ashworth',
    storySlug: 'the-attic-door-x9k2',
    commentId: null,
    actorSlug: 'juniper-ashworth',
    storyTitle: 'The Attic Door',
  },
  follow: {
    subject: 'Someone new is following you',
    action: 'started following you',
    actorName: 'Wren Oswin',
    storySlug: null,
    commentId: null,
    actorSlug: 'wren-oswin',
    storyTitle: null,
  },
  like: {
    subject: 'Your story found a reader',
    action: 'liked your story',
    actorName: 'Sable Marchetti',
    storySlug: 'what-the-static-said-p3q7',
    commentId: null,
    actorSlug: 'sable-marchetti',
    storyTitle: 'What the Static Said',
  },
  series: {
    subject: 'A subscribed series has a new part',
    action: 'published a new part',
    actorName: 'Mara Vane',
    storySlug: 'the-attic-door-part-two-z4m1',
    commentId: null,
    actorSlug: 'mara-vane',
    storyTitle: 'The Attic Door, Part Two',
  },
};

function renderNotification(sample: NotificationSample): string {
  const path = sample.storySlug
    ? `/stories/${sample.storySlug}${sample.commentId ? `#comment-${sample.commentId}` : ''}`
    : `/authors/${sample.actorSlug}`;
  const url = `${SITE_URL}${path}`;
  const sentence = `${sample.actorName} ${sample.action}${
    sample.storyTitle ? `, "${sample.storyTitle}".` : '.'
  }`;
  return renderEmailHtml({
    preheader: sentence,
    heading: sample.subject,
    bodyHtml: `<p style="margin:0;">${escapeHtml(sentence)}</p>`,
    cta: {label: 'View in the library', url},
    footnote:
      'You can change notification emails and quiet hours in your account settings.',
  });
}

interface MailPreviewEntry extends MailPreviewSummary {
  render: () => string;
}

// One entry per outgoing email template, each rendering through the exact
// builder functions production code calls (renderEmailHtml,
// buildDigestHtml, buildWinbackHtml) with representative sample data —
// never a separately-maintained mockup. Editing email-template.ts or
// either content builder shows up here on the next request; there is
// nothing to regenerate.
function buildEntries(): MailPreviewEntry[] {
  const entries: MailPreviewEntry[] = [
    {
      name: 'password-reset',
      category: 'Account',
      subject: 'Reset your Whispering Shadows password',
      preheader: 'Reset your password — this link expires in an hour.',
      trigger: 'POST /auth/forgot-password',
      recipient: 'reader@example.com',
      note: 'Same generic flow regardless of whether the address is registered — anti-enumeration by design. The reset link is single-use and expires in 1 hour.',
      render: () =>
        renderEmailHtml({
          preheader: 'Reset your password — this link expires in an hour.',
          heading: 'Reset your password',
          bodyHtml:
            '<p style="margin:0;">Someone (hopefully you) asked to reset your ' +
            'Whispering Shadows password. This link expires in an hour and ' +
            'works only once.</p>',
          cta: {
            label: 'Reset password',
            url: `${SITE_URL}/reset-password?token=example-token-abc123`,
          },
          footnote:
            "If you didn't request this, you can safely ignore this email.",
        }),
    },
    {
      name: 'registration-otp',
      category: 'Account',
      subject: 'Verify your Whispering Shadows email',
      preheader: 'Your verification code is 482913.',
      trigger: 'POST /auth/register',
      recipient: 'new-reader@example.com',
      note: 'No account or session exists until this 6-digit code is confirmed. Expires in 10 minutes; "Resend code" has a client-side cooldown.',
      render: () => {
        const code = '482913';
        return renderEmailHtml({
          preheader: `Your verification code is ${code}.`,
          heading: 'Verify your email',
          bodyHtml:
            '<p style="margin:0 0 20px;">Enter this code to finish creating ' +
            'your account. It expires in 10 minutes.</p>' +
            '<div style="padding:20px 12px; border:1px solid #34343d; border-radius:10px; background:#222229; text-align:center;">' +
            '<p style="margin:0; font-size:11px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:#777681;">Verification code</p>' +
            `<p style="margin:8px 0 0; font-size:34px; line-height:1.2; font-weight:700; letter-spacing:.24em; color:${EMAIL_ACCENT_COLOR}; font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;">${code}</p>` +
            '</div>',
          footnote:
            "If you didn't try to create an account, you can safely ignore this email.",
        });
      },
    },
    {
      name: 'weekly-digest',
      category: 'Retention',
      subject: 'Your weekly whispers',
      preheader: 'Your weekly whispers are ready.',
      trigger: 'Cron · Mondays 14:00 UTC',
      recipient: 'reader@example.com',
      note: "Skipped entirely (not sent empty) when there's genuinely nothing new — no followed-author stories, no active streak, no unread notifications.",
      render: () => {
        const digestHtml = buildDigestHtml({
          siteUrl: SITE_URL,
          currentStreak: 7,
          newStories: [
            {id: 'a1b2c3', title: 'The Attic Door', authorName: 'Mara Vane'},
            {
              id: 'd4e5f6',
              title: 'What the Static Said',
              authorName: 'Corin Blackwood',
            },
          ],
          unreadCount: 3,
        });
        return renderEmailHtml({
          preheader: 'Your weekly whispers are ready.',
          heading: 'Your weekly whispers',
          bodyHtml:
            digestHtml +
            '<p style="margin:22px 0 0; font-size:12px; color:#777681;">' +
            `<a href="${escapeHtml(`${SITE_URL}/digest/unsubscribe?token=example`)}" style="color:#a6a5af; text-decoration:underline;">Unsubscribe from weekly emails</a></p>`,
          cta: {label: 'Return to the library', url: SITE_URL},
        });
      },
    },
    {
      name: 'winback',
      category: 'Retention',
      subject: 'Your shelf is waiting',
      preheader: "We've saved your shelf for you.",
      trigger: 'Cron · Daily 15:00 UTC · 14+ days inactive',
      recipient: 'lapsed-reader@example.com',
      note: 'One send per lapse episode — returning and lapsing again makes a reader eligible again. Never mentions the (already-broken) reading streak.',
      render: () => {
        const winbackHtml = buildWinbackHtml({
          siteUrl: SITE_URL,
          newStories: [
            {
              id: 'g7h8i9',
              title: 'The Sound Under the Floor',
              authorName: 'Mara Vane',
            },
          ],
          unreadCount: 2,
        });
        return renderEmailHtml({
          preheader: "We've saved your shelf for you.",
          heading: 'Your shelf is waiting',
          bodyHtml:
            winbackHtml +
            '<p style="margin:22px 0 0; font-size:12px; color:#777681;">' +
            `<a href="${escapeHtml(`${SITE_URL}/winback/unsubscribe?token=example`)}" style="color:#a6a5af; text-decoration:underline;">Unsubscribe from these emails</a></p>`,
          cta: {label: 'Return to the library', url: SITE_URL},
        });
      },
    },
  ];

  const notificationMeta: Record<
    string,
    {trigger: string; recipient: string; note: string}
  > = {
    reply: {
      trigger: 'A reply lands on your comment',
      recipient: 'commenter@example.com',
      note: "Respects the recipient's quiet hours (delayed, not dropped) and their per-type email toggle.",
    },
    comment: {
      trigger: 'Someone comments on your story',
      recipient: 'author@example.com',
      note: "Respects the recipient's quiet hours (delayed, not dropped) and their per-type email toggle.",
    },
    follow: {
      trigger: 'Someone follows you',
      recipient: 'author@example.com',
      note: 'Links to the new follower’s profile rather than a story — the only notification type that does.',
    },
    like: {
      trigger: 'Someone likes your story',
      recipient: 'author@example.com',
      note: "Respects the recipient's quiet hours (delayed, not dropped) and their per-type email toggle.",
    },
    series: {
      trigger: 'A series you subscribed to publishes a new part',
      recipient: 'subscriber@example.com',
      note: 'Only fires once a scheduled part actually goes public — never for a part that is still scheduled ahead.',
    },
  };

  for (const [type, sample] of Object.entries(NOTIFICATION_SAMPLES)) {
    const meta = notificationMeta[type];
    entries.push({
      name: `notification-${type}`,
      category: 'Notifications',
      subject: sample.subject,
      preheader: `${sample.actorName} ${sample.action}${
        sample.storyTitle ? `, "${sample.storyTitle}".` : '.'
      }`,
      trigger: meta.trigger,
      recipient: meta.recipient,
      note: meta.note,
      render: () => renderNotification(sample),
    });
  }

  return entries;
}

@Injectable()
export class MailPreviewService {
  private readonly entries = buildEntries();

  list(): MailPreviewSummary[] {
    return this.entries.map((entry) => ({
      name: entry.name,
      category: entry.category,
      subject: entry.subject,
      preheader: entry.preheader,
      trigger: entry.trigger,
      recipient: entry.recipient,
      note: entry.note,
    }));
  }

  render(name: string): string {
    const entry = this.entries.find((candidate) => candidate.name === name);
    if (!entry) {
      throw new NotFoundException(`No mail preview named "${name}"`);
    }
    return entry.render();
  }
}
