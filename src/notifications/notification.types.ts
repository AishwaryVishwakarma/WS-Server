export const NOTIFICATION_TYPES = [
  'reply',
  'comment',
  'follow',
  'like',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
