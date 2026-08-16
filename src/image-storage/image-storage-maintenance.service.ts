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
    const files = await this.storage.listAll();
    const namespaceFiles = files.filter((file) =>
      this.storage.belongsToNamespace(file)
    );
    const stale = await this.staleFiles(namespaceFiles);
    return {
      usedBytes: this.totalBytes(files),
      capacityBytes: this.storage.capacityBytes(),
      fileCount: files.length,
      namespace: this.storage.namespace(),
      namespaceUsedBytes: this.totalBytes(namespaceFiles),
      namespaceFileCount: namespaceFiles.length,
      purgeEnabled: this.storage.purgeEnabled(),
      staleBytes: this.totalBytes(stale),
      staleFileCount: stale.length,
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
    const files = await this.storage.listAll();
    const stale = await this.staleFiles(
      files.filter((file) => this.storage.belongsToNamespace(file))
    );
    let deletedBytes = 0;
    let deletedFileCount = 0;
    let failedFileCount = 0;

    for (const [index, file] of stale.entries()) {
      try {
        await this.storage.delete(file.id);
        deletedBytes += file.size;
        deletedFileCount++;
      } catch {
        failedFileCount++;
      }
      await job?.updateProgress(Math.round(((index + 1) / stale.length) * 100));
    }

    return {
      deletedBytes,
      deletedFileCount,
      failedFileCount,
      completedAt: new Date().toISOString(),
    } satisfies ImagePurgeResult;
  }

  private async staleFiles(files: StoredImage[]): Promise<StoredImage[]> {
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
    const referenced = new Set([
      ...stories.map(({fileId}) => fileId),
      ...users.map(({fileId}) => fileId),
    ]);
    const cutoff = Date.now() - GRACE_PERIOD_MS;
    return files.filter(
      (file) =>
        !referenced.has(file.id) && new Date(file.createdAt).getTime() < cutoff
    );
  }

  private totalBytes(files: StoredImage[]) {
    return files.reduce((total, file) => total + file.size, 0);
  }
}
