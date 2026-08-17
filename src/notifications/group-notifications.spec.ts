import type {Notification} from './entities/notification.entity';
import {groupNotifications} from './group-notifications';

let nextId = 0;

function makeNotification(partial: Partial<Notification>): Notification {
  nextId += 1;
  return {
    id: `n${nextId}`,
    type: 'reply',
    actorName: 'Someone',
    actorId: 'actor-1',
    storyId: 'story-1',
    storyTitle: 'A Tale',
    commentId: 'comment-1',
    parentId: null,
    isRead: false,
    createdAt: new Date(`2026-07-24T10:0${nextId}:00.000Z`),
    ...partial,
  } as Notification;
}

describe('groupNotifications', () => {
  it('leaves a single notification ungrouped', () => {
    const n = makeNotification({});
    const [group] = groupNotifications([n]);
    expect(group).toMatchObject({
      id: n.id,
      ids: [n.id],
      count: 1,
      actorNames: [n.actorName],
      isRead: false,
    });
  });

  it('bundles several replies to the same thread from different actors', () => {
    const older = makeNotification({
      actorId: 'actor-alice',
      actorName: 'Alice',
      commentId: 'reply-old',
      createdAt: new Date('2026-07-24T10:00:00.000Z'),
    });
    const newer = makeNotification({
      actorId: 'actor-bob',
      actorName: 'Bob',
      commentId: 'reply-new',
      createdAt: new Date('2026-07-24T10:05:00.000Z'),
    });

    // Input must be newest-first, matching the service's query order.
    const [group] = groupNotifications([newer, older]);

    expect(group.count).toBe(2);
    expect(group.ids.sort()).toEqual([newer.id, older.id].sort());
    expect(group.actorNames).toEqual(['Bob', 'Alice']);
    // The newest member's fields represent the bundle, so a click still
    // deep-links to a real, recent comment.
    expect(group.commentId).toBe('reply-new');
    expect(group.actorName).toBe('Bob');
  });

  it('keeps two different actors distinct even when they share a display name', () => {
    const older = makeNotification({
      actorId: 'actor-alice-1',
      actorName: 'Alice',
      createdAt: new Date('2026-07-24T10:00:00.000Z'),
    });
    const newer = makeNotification({
      actorId: 'actor-alice-2',
      actorName: 'Alice',
      createdAt: new Date('2026-07-24T10:05:00.000Z'),
    });

    const [group] = groupNotifications([newer, older]);

    // Same name, but genuinely two people — must count as 2, not collapse
    // to 1 the way a name-only dedup would.
    expect(group.actorNames).toEqual(['Alice', 'Alice']);
    expect(group.count).toBe(2);
  });

  it('does not merge replies to different threads on the same story', () => {
    const threadA = makeNotification({parentId: 'thread-a'});
    const threadB = makeNotification({parentId: 'thread-b'});

    const groups = groupNotifications([threadB, threadA]);

    expect(groups).toHaveLength(2);
  });

  it('does not merge different notification types for the same story', () => {
    const reply = makeNotification({type: 'reply'});
    const like = makeNotification({type: 'like', parentId: null});

    const groups = groupNotifications([like, reply]);

    expect(groups).toHaveLength(2);
  });

  it('dedupes actorNames when the same person triggers the group twice', () => {
    const first = makeNotification({actorName: 'Alice'});
    const second = makeNotification({actorName: 'Alice'});

    const [group] = groupNotifications([second, first]);

    expect(group.count).toBe(2);
    expect(group.actorNames).toEqual(['Alice']);
  });

  it('is unread if any member is unread', () => {
    const read = makeNotification({isRead: true});
    const unread = makeNotification({isRead: false});

    const [group] = groupNotifications([unread, read]);

    expect(group.isRead).toBe(false);
  });

  it('is read only once every member is read', () => {
    const a = makeNotification({isRead: true});
    const b = makeNotification({isRead: true});

    const [group] = groupNotifications([b, a]);

    expect(group.isRead).toBe(true);
  });

  it('orders groups by their newest member, newest first', () => {
    const storyA = makeNotification({
      storyId: 'story-a',
      createdAt: new Date('2026-07-24T09:00:00.000Z'),
    });
    const storyB = makeNotification({
      storyId: 'story-b',
      createdAt: new Date('2026-07-24T11:00:00.000Z'),
    });

    const groups = groupNotifications([storyA, storyB]);

    expect(groups.map((g) => g.storyId)).toEqual(['story-b', 'story-a']);
  });
});
