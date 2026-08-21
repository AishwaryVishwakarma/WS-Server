import {ForbiddenException, Injectable} from '@nestjs/common';
import {InjectQueue} from '@nestjs/bullmq';
import {InjectRepository} from '@nestjs/typeorm';
import type {Queue} from 'bullmq';
import {Repository} from 'typeorm';
import {IMAGE_MAINTENANCE_QUEUE} from 'src/jobs/queue.constants';
import {DURABLE_JOB_OPTIONS} from 'src/jobs/queue.options';
import type {ImagePurgeJobData} from 'src/jobs/queue.types';
import {Story} from 'src/stories/entities/story.entity';
import {User} from 'src/users/entities/user.entity';
import {ImageStorageService, type StoredImage} from './image-storage.service';
import type {
  ImagePurgeResult,
  ImageStorageSnapshot,
} from './image-storage-maintenance.types';

const GRACE_PERIOD_HOURS = 24;
const GRACE_PERIOD_MS = GRACE_PERIOD_HOURS * 60 * 60 * 1000;
const PURGE_JOB_ID = 'image-purge';

@Injectable()
export class ImageStorageMaintenanceService {
  constructor(
    private readonly storage: ImageStorageService,
    @InjectRepository(Story)
    private readonly stories: Repository<Story>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectQueue(IMAGE_MAINTENANCE_QUEUE)
    private readonly queue: Queue<ImagePurgeJobData>
  ) {}

  async snapshot(): Promise<ImageStorageSnapshot> {
    const referenced = await this._referencedFileIds();
    const cutoff = Date.now() - GRACE_PERIOD_MS;

    let usedBytes = 0;
    let fileCount = 0;
    let namespaceUsedBytes = 0;
    let namespaceFileCount = 0;
    let staleBytes = 0;
    let staleFileCount = 0;

    for await (const {files} of this.storage.listAllPages()) {
      for (const file of files) {
        fileCount++;
        usedBytes += file.size;
        if (!this.storage.belongsToNamespace(file)) continue;
        namespaceFileCount++;
        namespaceUsedBytes += file.size;
        if (this._isStale(file, referenced, cutoff)) {
          staleFileCount++;
          staleBytes += file.size;
        }
      }
    }

    return {
      usedBytes,
      capacityBytes: this.storage.capacityBytes(),
      fileCount,
      namespace: this.storage.namespace(),
      namespaceUsedBytes,
      namespaceFileCount,
      purgeEnabled: this.storage.purgeEnabled(),
      staleBytes,
      staleFileCount,
      gracePeriodHours: GRACE_PERIOD_HOURS,
      checkedAt: new Date().toISOString(),
    };
  }

  async enqueuePurge(requestedBy: string) {
    if (!this.storage.purgeEnabled()) {
      throw new ForbiddenException(
        'Image purge is disabled in this environment'
      );
    }
    const existing = await this.queue.getJob(PURGE_JOB_ID);
    if (existing) {
      const state = await existing.getState();
      if (['active', 'waiting', 'delayed'].includes(state)) {
        return {jobId: String(existing.id), status: state};
      }
      await existing.remove();
    }

    const job = await this.queue.add(
      'purge-stale',
      {requestedBy},
      {...DURABLE_JOB_OPTIONS, jobId: PURGE_JOB_ID}
    );
    return {jobId: String(job.id), status: 'queued'};
  }

  async jobStatus(jobId: string) {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;
    const state = await job.getState();
    return {
      jobId: String(job.id),
      status: state,
      progress: typeof job.progress === 'number' ? job.progress : 0,
      result: (job.returnvalue as ImagePurgeResult | undefined) ?? null,
      failedReason: job.failedReason || null,
    };
  }

  async purge(job?: {updateProgress(value: number): Promise<void>}) {
    if (!this.storage.purgeEnabled()) {
      throw new ForbiddenException(
        'Image purge is disabled in this environment'
      );
    }
    const referenced = await this._referencedFileIds();
    const cutoff = Date.now() - GRACE_PERIOD_MS;

    let deletedBytes = 0;
    let deletedFileCount = 0;
    let failedFileCount = 0;
    let scanned = 0;

    for await (const {files, total} of this.storage.listAllPages()) {
      for (const file of files) {
        scanned++;
        if (
          this.storage.belongsToNamespace(file) &&
          this._isStale(file, referenced, cutoff)
        ) {
          try {
            await this.storage.delete(file.id);
            deletedBytes += file.size;
            deletedFileCount++;
          } catch {
            failedFileCount++;
          }
        }
        // Reports scan progress (files examined / bucket total) rather than
        // "stale files deleted so far" — the latter would need a full pass
        // up front just to learn the denominator, defeating the point of
        // streaming pages instead of materializing the whole bucket first.
        await job?.updateProgress(
          total > 0 ? Math.round((scanned / total) * 100) : 100
        );
      }
    }

    return {
      deletedBytes,
      deletedFileCount,
      failedFileCount,
      completedAt: new Date().toISOString(),
    } satisfies ImagePurgeResult;
  }

  private async _referencedFileIds(): Promise<Set<string>> {
    const [stories, users] = await Promise.all([
      this.stories
        .createQueryBuilder('story')
        .select('story.coverImageFileId', 'fileId')
        .where('story.coverImageFileId IS NOT NULL')
        .getRawMany<{fileId: string}>(),
      this.users
        .createQueryBuilder('user')
        .withDeleted()
        .select('user.profileImageFileId', 'fileId')
        .where('user.profileImageFileId IS NOT NULL')
        .getRawMany<{fileId: string}>(),
    ]);
    return new Set([
      ...stories.map(({fileId}) => fileId),
      ...users.map(({fileId}) => fileId),
    ]);
  }

  private _isStale(
    file: StoredImage,
    referenced: Set<string>,
    cutoffMs: number
  ): boolean {
    return (
      !referenced.has(file.id) && new Date(file.createdAt).getTime() < cutoffMs
    );
  }
}
