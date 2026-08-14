export enum AchievementKey {
  Storyteller = 'storyteller',
  CrowdFavorite = 'crowd-favorite',
  CampfireHost = 'campfire-host',
  SerialStoryteller = 'serial-storyteller',
  ReadingRitual = 'reading-ritual',
  NightExplorer = 'night-explorer',
}

export type AchievementCategory = 'author' | 'reader';
export type AchievementTier = 1 | 2 | 3;

export interface AchievementDefinition {
  key: AchievementKey;
  category: AchievementCategory;
  thresholds: readonly [number, number, number];
}

export interface AchievementProgress extends AchievementDefinition {
  progress: number;
  highestUnlockedTier: 0 | AchievementTier;
}

export interface AchievementBadge {
  key: AchievementKey;
  tier: AchievementTier;
}

export const ACHIEVEMENT_DEFINITIONS: readonly AchievementDefinition[] = [
  {
    key: AchievementKey.Storyteller,
    category: 'author',
    thresholds: [1, 5, 10],
  },
  {
    key: AchievementKey.CrowdFavorite,
    category: 'author',
    thresholds: [5, 25, 100],
  },
  {
    key: AchievementKey.CampfireHost,
    category: 'author',
    thresholds: [5, 25, 100],
  },
  {
    key: AchievementKey.SerialStoryteller,
    category: 'author',
    thresholds: [1, 3, 5],
  },
  {
    key: AchievementKey.ReadingRitual,
    category: 'reader',
    thresholds: [7, 30, 100],
  },
  {
    key: AchievementKey.NightExplorer,
    category: 'reader',
    thresholds: [5, 25, 100],
  },
] as const;

export function unlockedTier(
  progress: number,
  thresholds: readonly [number, number, number]
): 0 | AchievementTier {
  if (progress >= thresholds[2]) return 3;
  if (progress >= thresholds[1]) return 2;
  if (progress >= thresholds[0]) return 1;
  return 0;
}
