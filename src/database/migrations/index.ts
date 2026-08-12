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

export const migrations = [
  Baseline1786175459406,
  AddDigestEmailGloballyEnabled1786515981348,
  AddStoryAuthorFeedIndex1786530000000,
];
