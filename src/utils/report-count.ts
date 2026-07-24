import type {Repository} from 'typeorm';
import type {QueryDeepPartialEntity} from 'typeorm/query-builder/QueryPartialEntity';

// Anything with a denormalized reportCount + updatedAt column recomputed by
// StoriesService/CommentsService/UsersService's report()/resolve() methods.
interface Reportable {
  id: string;
  updatedAt: Date;
  reportCount: number;
}

// Persists `reportCount` via a targeted update that preserves the entity's
// existing updatedAt — a report/resolve is moderation metadata, not a content
// edit, so it must never trip an "edited" indicator (TypeORM only auto-bumps
// the update-date column when it isn't among the set columns). `extra`
// carries any other columns the caller wants set in the same update (e.g.
// Comment's isFlagged). Mutates `entity` in place to match what was
// persisted, so the caller's in-memory copy stays consistent.
export async function syncReportCount<T extends Reportable>(
  repository: Pick<Repository<T>, 'update'>,
  entity: T,
  reportCount: number,
  extra?: Partial<T>
): Promise<void> {
  await repository.update(entity.id, {
    ...extra,
    reportCount,
    updatedAt: entity.updatedAt,
  } as QueryDeepPartialEntity<T>);
  Object.assign(entity, extra, {reportCount});
}
