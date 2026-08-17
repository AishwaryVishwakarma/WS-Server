export enum AchievementKey {
  Storyteller = 'storyteller',
  CrowdFavorite = 'crowd-favorite',
  CampfireHost = 'campfire-host',
  SerialStoryteller = 'serial-storyteller',
  ReadingRitual = 'reading-ritual',
  NightExplorer = 'night-explorer',
}

export type AchievementCategory = 'author' | 'reader';
// Tier 4 ("Obsidian") is Patron+ only — see unlockedTier's isMember param.
// A Free member whose progress already clears thresholds[3] stays capped at
// tier 3 rather than silently unlocking it — the achievement itself is still
// earned by real activity either way, membership only gates the top rung.
export type AchievementTier = 1 | 2 | 3 | 4;

export interface AchievementDefinition {
  key: AchievementKey;
  category: AchievementCategory;
  thresholds: readonly [number, number, number, number];
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
    thresholds: [1, 5, 10, 25],
  },
  {
    key: AchievementKey.CrowdFavorite,
    category: 'author',
    thresholds: [5, 25, 100, 250],
  },
  {
    key: AchievementKey.CampfireHost,
    category: 'author',
    thresholds: [5, 25, 100, 250],
  },
  {
    key: AchievementKey.SerialStoryteller,
    category: 'author',
    thresholds: [1, 3, 5, 10],
  },
  {
    key: AchievementKey.ReadingRitual,
    category: 'reader',
    thresholds: [7, 30, 100, 200],
  },
  {
    key: AchievementKey.NightExplorer,
    category: 'reader',
    thresholds: [5, 25, 100, 250],
  },
] as const;

export function unlockedTier(
  progress: number,
  thresholds: readonly [number, number, number, number],
  isMember: boolean
): 0 | AchievementTier {
  if (progress >= thresholds[3] && isMember) return 4;
  if (progress >= thresholds[2]) return 3;
  if (progress >= thresholds[1]) return 2;
  if (progress >= thresholds[0]) return 1;
  return 0;
}
