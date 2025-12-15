export const NOTIFICATION_TYPES = {
  SKILL_QUEUE_LOW: "skill_queue_low",
} as const;

export type NotificationType = typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES];


