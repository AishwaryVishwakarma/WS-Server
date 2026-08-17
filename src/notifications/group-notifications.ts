import type {Notification} from './entities/notification.entity';
import type {NotificationType} from './notification.types';

export interface GroupedNotification {
  id: string;
  ids: string[];
  type: NotificationType;
  actorName: string;
  actorNames: string[];
  count: number;
  actorId: string | null;
  actorSlug: string | null;
  storyId: string | null;
  storySlug: string | null;
  storyTitle: string | null;
  commentId: string | null;
  parentId: string | null;
  isRead: boolean;
  createdAt: Date;
}

function groupKey(notification: Notification): string {
  return `${notification.type}:${notification.storyId ?? ''}:${notification.parentId ?? ''}`;
}

/**
 * Collapses notifications sharing the same (type, storyId, parentId) into a
 * single bundle — "Alice, Bob and 3 others replied to your story" instead of
 * 5 separate rows. A reader replying twice to the same thread still counts
 * once in `actorNames` (it's really just Alice) but twice in `count` and
 * `ids`, since both underlying notifications still need marking read/deleted
 * together. `isRead` is true only once every member is.
 *
 * Actor identity for that dedup is `actorId` (falling back to `actorName`
 * only when it's null, e.g. a removed account) — never `actorName` alone,
 * since two real people can share a display name and must still count as
 * distinct "others".
 *
 * `input` must already be sorted newest-first — a bundle's single-value
 * fields (id, actorName, commentId, createdAt) come from its newest member,
 * so a click still deep-links somewhere real (the most recent event) rather
 * than an arbitrary one. Only groups within the given page of rows, not the
 * reader's whole history — a burst that straddles a page boundary forms two
 * smaller bundles instead of one, an accepted trade-off for not needing a
 * separate unbounded query (the bell has no pagination UI, so this only
 * matters for an unusually large single fetch).
 */
export function groupNotifications(
  input: Notification[]
): GroupedNotification[] {
  const groups = new Map<string, Notification[]>();
  for (const notification of input) {
    const key = groupKey(notification);
    const bucket = groups.get(key);
    if (bucket) bucket.push(notification);
    else groups.set(key, [notification]);
  }

  return Array.from(groups.values())
    .map((members): GroupedNotification => {
      const [newest] = members;
      // Keyed by identity, not the display string — members is newest-first,
      // so the first occurrence of a given identity also fixes the name
      // shown for them.
      const actorsSeen = new Map<string, string>();
      for (const member of members) {
        const identity = member.actorId ?? member.actorName;
        if (!actorsSeen.has(identity)) {
          actorsSeen.set(identity, member.actorName);
        }
      }
      return {
        id: newest.id,
        ids: members.map((member) => member.id),
        type: newest.type,
        actorName: newest.actorName,
        actorNames: [...actorsSeen.values()],
        count: members.length,
        actorId: newest.actorId,
        actorSlug: newest.actorSlug,
        storyId: newest.storyId,
        storySlug: newest.storySlug,
        storyTitle: newest.storyTitle,
        commentId: newest.commentId,
        parentId: newest.parentId,
        isRead: members.every((member) => member.isRead),
        createdAt: newest.createdAt,
      };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
