export enum StoryStatus {
  /** Private to the author — invisible to moderation until submitted. */
  Draft = 'draft',
  Pending = 'pending',
  Approved = 'approved',
  Rejected = 'rejected',
  Flagged = 'flagged',
}

/** The statuses moderation works with — drafts are the author's business. */
export const MODERATION_STATUSES = [
  StoryStatus.Pending,
  StoryStatus.Approved,
  StoryStatus.Rejected,
  StoryStatus.Flagged,
] as const;
