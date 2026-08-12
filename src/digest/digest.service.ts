import {Injectable} from '@nestjs/common';
import {InjectQueue} from '@nestjs/bullmq';
import {Cron} from '@nestjs/schedule';
import {InjectRepository} from '@nestjs/typeorm';
import {MoreThan, Repository} from 'typeorm';
import {ConfigService} from '@nestjs/config';
import type {Queue} from 'bullmq';
import {User} from 'src/users/entities/user.entity';
import {FollowsService} from 'src/follows/follows.service';
import {MutesService} from 'src/mutes/mutes.service';
import {StoriesService} from 'src/stories/stories.service';
import {NotificationsService} from 'src/notifications/notifications.service';
import {MailTransportService} from 'src/mail/mail-transport.service';
import {buildDigestText, buildDigestHtml} from './digest-content';
import {renderEmailHtml} from 'src/mail/email-template';
import {SettingsService} from 'src/settings/settings.service';
import {DIGEST_QUEUE} from 'src/jobs/queue.constants';
import {DURABLE_JOB_OPTIONS} from 'src/jobs/queue.options';

const DIGEST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const DIGEST_BATCH_SIZE = 100;

@Injectable()
export class DigestService {
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
    @InjectQueue(DIGEST_QUEUE) private readonly digestQueue: Queue
  ) {}

  // Mondays 14:00 UTC. Also reachable manually via POST /admin/digest/send
  // (see DigestController) — for QA, and so an admin isn't purely at the
  // cron's mercy. Both respect the same site-wide off switch: a manual send
  // while digest is globally disabled should not quietly work anyway.
  @Cron('0 14 * * 1')
  async sendWeeklyDigests(): Promise<{sent: number}> {
    if (!(await this.settingsService.isDigestEmailGloballyEnabled())) {
      return {sent: 0};
    }

    let queued = 0;
    let cursor: string | undefined;
    const week = this._digestWeekKey(new Date());

    while (true) {
      const users = await this.usersRepository.find({
        where: {
          digestEmailEnabled: true,
          ...(cursor ? {id: MoreThan(cursor)} : {}),
        },
        order: {id: 'ASC'},
        take: DIGEST_BATCH_SIZE,
      });
      if (users.length === 0) break;

      for (const user of users) {
        await this.digestQueue.add(
          'weekly',
          {userId: user.id},
          {...DURABLE_JOB_OPTIONS, jobId: `weekly-${week}-${user.id}`}
        );
        queued++;
      }
      cursor = users.at(-1)!.id;
    }

    return {sent: queued};
  }

  async processUser(userId: string): Promise<boolean> {
    const user = await this.usersRepository.findOne({where: {id: userId}});
    if (!user || !user.digestEmailEnabled) return false;
    if (!(await this.settingsService.isDigestEmailGloballyEnabled())) {
      return false;
    }

    const since =
      user.lastDigestSentAt ?? new Date(Date.now() - DIGEST_WINDOW_MS);

    const [authorIds, mutedIds, unreadCount] = await Promise.all([
      this.followsService.followingIds(user.id),
      this.mutesService.mutedAuthorIds(user.id),
      this.notificationsService.unreadCount(user.id),
    ]);
    const visibleAuthorIds = authorIds.filter((id) => !mutedIds.includes(id));

    let newStories: {title: string; id: string; authorName: string}[] = [];
    if (visibleAuthorIds.length > 0) {
      // Reuses the existing Following-feed query (already newest-first) — no
      // new StoriesService method needed, just a service-side date filter
      // over one bounded page.
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
    const digestInput = {
      siteUrl,
      currentStreak: user.currentStreak,
      newStories,
      unreadCount,
    };
    const body = buildDigestText(digestInput);
    if (!body) return false;

    const html = renderEmailHtml({
      preheader: 'Your weekly whispers are ready.',
      heading: 'Your weekly whispers',
      bodyHtml: buildDigestHtml(digestInput) ?? '',
    });

    await this.mailTransport.deliver({
      to: user.email,
      subject: 'Your weekly whispers',
      text: body,
      html,
    });
    await this.usersRepository.update(user.id, {lastDigestSentAt: new Date()});
    return true;
  }

  private _digestWeekKey(date: Date): string {
    const utc = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    );
    const daysSinceMonday = (utc.getUTCDay() + 6) % 7;
    utc.setUTCDate(utc.getUTCDate() - daysSinceMonday);
    return utc.toISOString().slice(0, 10);
  }
}
