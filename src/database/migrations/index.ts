// Explicit migration registry — imported by both the app (app.module.ts) and
// the CLI data source. An explicit array instead of a glob so migrations load
// identically under nest build (dist) and ts-jest (src).
//
// After `npm run migration:generate -- src/database/migrations/<Name>`,
// import the new class here and append it to the array.
//
// This is a fresh Postgres baseline (see CLAUDE.md) — the pre-migration
// MySQL history was deleted rather than translated, since there was no data
// to preserve across the engine switch.

import {Baseline1786175459406} from './1786175459406-Baseline';
import {AddDigestEmailGloballyEnabled1786515981348} from './1786515981348-AddDigestEmailGloballyEnabled';
import {AddStoryAuthorFeedIndex1786530000000} from './1786530000000-AddStoryAuthorFeedIndex';
import {AddAnalyticsEvents1786540000000} from './1786540000000-AddAnalyticsEvents';
import {DisableDigestEmailByDefault1786550000000} from './1786550000000-DisableDigestEmailByDefault';
import {AddEmailSuppressionState1786600000000} from './1786600000000-AddEmailSuppressionState';
import {AddNotificationPreferences1786610000000} from './1786610000000-AddNotificationPreferences';
import {AddPendingStoryAgeIndex1786620000000} from './1786620000000-AddPendingStoryAgeIndex';
import {AddNotificationEmailGlobalToggle1786630000000} from './1786630000000-AddNotificationEmailGlobalToggle';
import {AddImageStorageIds1786640000000} from './1786640000000-AddImageStorageIds';
import {RemoveAvatarCustomization1786650000000} from './1786650000000-RemoveAvatarCustomization';
import {RemovePendingProfileImageUrl1786660000000} from './1786660000000-RemovePendingProfileImageUrl';
import {AddMembershipTier1786882214528} from './1786882214528-AddMembershipTier';
import {AddMembershipFeaturesToggle1786882435043} from './1786882435043-AddMembershipFeaturesToggle';

export const migrations = [
  Baseline1786175459406,
  AddDigestEmailGloballyEnabled1786515981348,
  AddStoryAuthorFeedIndex1786530000000,
  AddAnalyticsEvents1786540000000,
  DisableDigestEmailByDefault1786550000000,
  AddEmailSuppressionState1786600000000,
  AddNotificationPreferences1786610000000,
  AddPendingStoryAgeIndex1786620000000,
  AddNotificationEmailGlobalToggle1786630000000,
  AddImageStorageIds1786640000000,
  RemoveAvatarCustomization1786650000000,
  RemovePendingProfileImageUrl1786660000000,
  AddMembershipTier1786882214528,
  AddMembershipFeaturesToggle1786882435043,
];
