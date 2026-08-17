import {Injectable, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {getPaginatedResponse, paginate} from 'src/utils/pagination';
import {Notification} from './entities/notification.entity';
import type {NotificationType} from './notification.types';
import {groupNotifications} from './group-notifications';
import {NotificationsStream} from './notifications-stream.service';
import {User} from 'src/users/entities/user.entity';
import {MailService} from 'src/mail/mail.service';
import {ConfigService} from '@nestjs/config';
import {escapeHtml, renderEmailHtml} from 'src/mail/email-template';
import {SettingsService} from 'src/settings/settings.service';

interface NotificationInput {
  type: NotificationType;
  recipientId: string;
  actorName: string;
  actorId: string;
  actorSlug: string;
  // Story/comment context — present for 'comment'/'reply', omitted for 'follow'.
  storyId?: string | null;
  storySlug?: string | null;
  storyTitle?: string | null;
  commentId?: string | null;
  // Only set for a 'reply' — the top-level thread the reply lives under.
  parentId?: string | null;
}

// The bell has no pagination UI — this is just "how much recent history is
// worth grouping/showing", shared by findAllForUser and unreadCount so they
// can never disagree about which groups exist (see unreadCount).
const DEFAULT_PAGE_SIZE = 20;

const EMAIL_COPY: Record<NotificationType, {subject: string; action: string}> =
  {
    reply: {
      subject: 'A new reply in the shadows',
      action: 'replied to your comment',
    },
    comment: {
      subject: 'A new comment on your story',
      action: 'commented on your story',
    },
    follow: {
      subject: 'Someone new is following you',
      action: 'started following you',
    },
    like: {subject: 'Your story found a reader', action: 'liked your story'},
  };

const minutes = (value: string) => {
  const [hours, mins] = value.split(':').map(Number);
  return hours * 60 + mins;
};

export function quietHoursDelay(
  now: Date,
  start: string | null,
  end: string | null,
  timezoneOffset: number
): number {
  if (!start || !end || start === end) return 0;
  const localMinute =
    (now.getUTCHours() * 60 + now.getUTCMinutes() + timezoneOffset + 1440) %
    1440;
  const startMinute = minutes(start);
  const endMinute = minutes(end);
  const quiet =
    startMinute < endMinute
      ? localMinute >= startMinute && localMinute < endMinute
      : localMinute >= startMinute || localMinute < endMinute;
  if (!quiet) return 0;
  return ((endMinute - localMinute + 1440) % 1440) * 60_000;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationsRepository: Repository<Notification>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly stream: NotificationsStream,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService
  ) {}

  async createNotification(input: NotificationInput) {
    const recipient = await this.usersRepository.findOneBy({
      id: input.recipientId,
    });
    if (!recipient) return null;

    let saved: Notification | null = null;
    if (recipient.notificationInAppTypes.includes(input.type)) {
      const notification = this.notificationsRepository.create({
        recipient: {id: input.recipientId},
        type: input.type,
        actorName: input.actorName,
        actorId: input.actorId,
        actorSlug: input.actorSlug,
        storyId: input.storyId ?? null,
        storySlug: input.storySlug ?? null,
        storyTitle: input.storyTitle ?? null,
        commentId: input.commentId ?? null,
        parentId: input.parentId ?? null,
      });
      saved = await this.notificationsRepository.save(notification);
      await this.stream.publish(input.recipientId, input.storyId ?? undefined);
    }

    if (
      recipient.notificationEmailTypes.includes(input.type) &&
      (await this.settingsService.isNotificationEmailGloballyEnabled())
    ) {
      await this._queueEmail(recipient, input);
    }
    return saved;
  }

  private async _queueEmail(recipient: User, input: NotificationInput) {
    const copy = EMAIL_COPY[input.type];
    const siteUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const path = input.storySlug
      ? `/stories/${input.storySlug}${input.commentId ? `#comment-${input.commentId}` : ''}`
      : `/authors/${input.actorSlug}`;
    const url = `${siteUrl}${path}`;
    const sentence = `${input.actorName} ${copy.action}${
      input.storyTitle ? `, “${input.storyTitle}”.` : '.'
    }`;
    const html = renderEmailHtml({
      preheader: sentence,
      heading: copy.subject,
      bodyHtml: `<p style="margin:0;">${escapeHtml(sentence)}</p>`,
      cta: {label: 'View in the library', url},
      footnote:
        'You can change notification emails and quiet hours in your account settings.',
    });
    const delay = quietHoursDelay(
      new Date(),
      recipient.notificationQuietStart,
      recipient.notificationQuietEnd,
      recipient.notificationTimezoneOffset
    );
    await this.mailService.send(
      recipient.email,
      copy.subject,
      `${sentence}\n\n${url}`,
      html,
      {delay}
    );
  }

  // Bundles same-story/-thread notifications ("Alice, Bob and 3 others
  // replied") within the fetched page — see groupNotifications for the
  // grouping rule and its page-boundary trade-off. total/totalPages still
  // reflect the raw (ungrouped) row count: the bell has no pagination UI, so
  // nothing depends on them exactly matching the grouped item count.
  async findAllForUser(
    userId: string,
    page: number = 1,
    limit: number = DEFAULT_PAGE_SIZE
  ) {
    const {skip, take} = paginate(page, limit);
    const [items, total] = await this.notificationsRepository.findAndCount({
      where: {recipient: {id: userId}},
      order: {createdAt: 'DESC'},
      skip,
      take,
    });
    return getPaginatedResponse(groupNotifications(items), total, page, limit);
  }

  // Counts unread groups within the *same* recent window findAllForUser's
  // first page groups from — not a distinct count over the recipient's whole
  // unread history. That mismatch was a real bug: an old unread notification
  // that had scrolled behind DEFAULT_PAGE_SIZE more recent (read) ones would
  // still count toward the badge here without ever appearing in the list,
  // which the list's own page-1 fetch would never surface either — so the
  // bell showed "1" with nothing visibly new. Matching the same window means
  // the two can't disagree: whatever's counted is exactly what's shown.
  async unreadCount(userId: string) {
    const recent = await this.notificationsRepository.find({
      where: {recipient: {id: userId}},
      order: {createdAt: 'DESC'},
      take: DEFAULT_PAGE_SIZE,
    });
    return groupNotifications(recent).filter((group) => !group.isRead).length;
  }

  async markRead(id: string, userId: string) {
    // Scope the lookup to the caller so a missing id and someone else's
    // notification are indistinguishable — both 404 rather than silently
    // "succeeding". Find-then-conditionally-save also skips a pointless
    // write when the notification is already read.
    const notification = await this.notificationsRepository.findOne({
      where: {id, recipient: {id: userId}},
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    if (!notification.isRead) {
      notification.isRead = true;
      await this.notificationsRepository.save(notification);
    }
  }

  async markAllRead(userId: string) {
    await this.notificationsRepository
      .createQueryBuilder()
      .update()
      .set({isRead: true})
      .where('recipientId = :userId AND isRead = false', {userId})
      .execute();
  }

  async remove(id: string, userId: string) {
    // Same scoping as markRead: a missing id and someone else's notification
    // both 404 rather than silently no-op. Notifications are ephemeral, so this
    // is a hard delete.
    const notification = await this.notificationsRepository.findOne({
      where: {id, recipient: {id: userId}},
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    await this.notificationsRepository.remove(notification);
  }

  async clearRead(userId: string) {
    await this.notificationsRepository
      .createQueryBuilder()
      .delete()
      .where('recipientId = :userId AND isRead = true', {userId})
      .execute();
  }
}
