import {Injectable} from '@nestjs/common';
import {InjectQueue} from '@nestjs/bullmq';
import {Cron} from '@nestjs/schedule';
import {InjectRepository} from '@nestjs/typeorm';
import {Repository} from 'typeorm';
import {ConfigService} from '@nestjs/config';
import type {Queue} from 'bullmq';
import {User} from 'src/users/entities/user.entity';
import {FollowsService} from 'src/follows/follows.service';
import {MutesService} from 'src/mutes/mutes.service';
import {StoriesService} from 'src/stories/stories.service';
import {NotificationsService} from 'src/notifications/notifications.service';
import {MailTransportService} from 'src/mail/mail-transport.service';
import type {DigestNewStory} from './digest-content';
import {buildWinbackText, buildWinbackHtml} from './winback-content';
import {renderEmailHtml, escapeHtml} from 'src/mail/email-template';
import {SettingsService} from 'src/settings/settings.service';
import {WINBACK_QUEUE} from 'src/jobs/queue.constants';
import {DURABLE_JOB_OPTIONS} from 'src/jobs/queue.options';
import {WinbackUnsubscribeService} from './winback-unsubscribe.service';

// A reader is "lapsed" once this many days pass with no recorded activity
// (see User.lastActiveDate / UsersService.recordActivity) — matches the
// product decision that the weekly digest silently going quiet (nothing new
// to report) is exactly the population a win-back email should catch.
const WINBACK_LAPSE_DAYS = 14;
const WINBACK_BATCH_SIZE = 100;

@Injectable()
export class WinbackService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly followsService: FollowsService,
    private readonly mutesService: MutesService,
    private readonly storiesService: StoriesService,
    private readonly notificationsService: NotificationsService,
    private readonly mailTransport: MailTransportService,
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
    @InjectQueue(WINBACK_QUEUE) private readonly winbackQueue: Queue,
    private readonly winbackUnsubscribe: WinbackUnsubscribeService
  ) {}

  // Daily (offset from the weekly digest's Monday 14:00 UTC), also reachable
  // manually via POST /admin/winback/send for QA. Both respect the same
  // site-wide off switch.
  @Cron('0 15 * * *')
  async sendWinbackEmails(): Promise<{sent: number}> {
    if (!(await this.settingsService.isWinbackEmailGloballyEnabled())) {
      return {sent: 0};
    }

    const cutoff = this._daysAgo(WINBACK_LAPSE_DAYS);
    const todayKey = new Date().toISOString().slice(0, 10);

    let queued = 0;
    let cursor: string | undefined;

    while (true) {
      const qb = this.usersRepository
        .createQueryBuilder('user')
        .select('user.id')
        .where('user.winbackEmailEnabled = true')
        .andWhere('user.lastActiveDate IS NOT NULL')
        .andWhere('user.lastActiveDate <= :cutoff', {cutoff})
        // One send per lapse episode: if the reader came back after their
        // last win-back email, lastActiveDate advances past
        // winbackEmailSentAt, making them eligible again on their *next*
        // lapse rather than every day they stay gone.
        .andWhere(
          '(user.winbackEmailSentAt IS NULL OR user.winbackEmailSentAt::date < user.lastActiveDate::date)'
        )
        .orderBy('user.id', 'ASC')
        .take(WINBACK_BATCH_SIZE);
      if (cursor) qb.andWhere('user.id > :cursor', {cursor});

      const users = await qb.getMany();
      if (users.length === 0) break;

      await this.winbackQueue.addBulk(
        users.map((user) => ({
          name: 'winback',
          data: {userId: user.id},
          opts: {
            ...DURABLE_JOB_OPTIONS,
            jobId: `winback-${todayKey}-${user.id}`,
          },
        }))
      );
      queued += users.length;
      cursor = users.at(-1)!.id;
    }

    return {sent: queued};
  }

  async processUser(userId: string): Promise<boolean> {
    const user = await this.usersRepository.findOne({where: {id: userId}});
    if (!user || !user.winbackEmailEnabled || !user.lastActiveDate) {
      return false;
    }
    if (!(await this.settingsService.isWinbackEmailGloballyEnabled())) {
      return false;
    }

    const since = new Date(`${user.lastActiveDate}T00:00:00.000Z`);

    const [authorIds, mutedIds, unreadCount] = await Promise.all([
      this.followsService.followingIds(user.id),
      this.mutesService.mutedAuthorIds(user.id),
      this.notificationsService.unreadCount(user.id),
    ]);
    const mutedIdSet = new Set(mutedIds);
    const visibleAuthorIds = authorIds.filter((id) => !mutedIdSet.has(id));

    let newStories: DigestNewStory[] = [];
    if (visibleAuthorIds.length > 0) {
      const {data} = await this.storiesService.findApprovedByAuthorIds(
        visibleAuthorIds,
        1,
        20
      );
      newStories = data
        .filter((story) => story.createdAt > since)
        .slice(0, 5)
        .map((story) => ({
          title: story.title,
          id: story.id,
          authorName: story.author?.name ?? 'Unknown',
        }));
    }

    const siteUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const winbackInput = {siteUrl, newStories, unreadCount};
    const body = buildWinbackText(winbackInput);
    if (!body) return false;

    const apiUrl =
      this.configService.get<string>('BACKEND_URL') ??
      (this.configService.get<string>('RAILWAY_PUBLIC_DOMAIN')
        ? `https://${this.configService.get<string>('RAILWAY_PUBLIC_DOMAIN')}`
        : 'http://localhost:8000');
    const unsubscribeUrl = `${apiUrl}/winback/unsubscribe?token=${encodeURIComponent(
      this.winbackUnsubscribe.createToken(user.id)
    )}`;
    const winbackHtml = buildWinbackHtml(winbackInput) ?? '';

    const html = renderEmailHtml({
      preheader: "We've saved your shelf for you.",
      heading: 'Your shelf is waiting',
      bodyHtml:
        winbackHtml +
        `<p style="margin:22px 0 0; font-size:12px; color:#777681;">` +
        `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#a6a5af; text-decoration:underline;">Unsubscribe from these emails</a></p>`,
      cta: {label: 'Return to the library', url: siteUrl},
    });

    await this.mailTransport.deliver({
      to: user.email,
      subject: 'Your shelf is waiting',
      text: `${body}\n\nUnsubscribe from these emails: ${unsubscribeUrl}`,
      html,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    await this.usersRepository.update(user.id, {
      winbackEmailSentAt: new Date(),
    });
    return true;
  }

  private _daysAgo(days: number): string {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
  }
}
