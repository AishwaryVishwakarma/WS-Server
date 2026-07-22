// Explicit migration registry — imported by both the app (app.module.ts) and
// the CLI data source. An explicit array instead of a glob so migrations load
// identically under nest build (dist) and ts-jest (src).
//
// After `npm run migration:generate -- src/database/migrations/<Name>`,
// import the new class here and append it to the array.

import {Baseline1783883957794} from './1783883957794-Baseline';
import {AddCommentParent1783938584720} from './1783938584720-AddCommentParent';
import {AddCommentReports1784177051286} from './1784177051286-AddCommentReports';
import {AddNotifications1784262275676} from './1784262275676-AddNotifications';
import {AddNotificationParentId1784350000000} from './1784350000000-AddNotificationParentId';
import {AddPerformanceIndexes1784400000000} from './1784400000000-AddPerformanceIndexes';
import {AddBookmarks1784500000000} from './1784500000000-AddBookmarks';

export const migrations = [
  Baseline1783883957794,
  AddCommentParent1783938584720,
  AddCommentReports1784177051286,
  AddNotifications1784262275676,
  AddNotificationParentId1784350000000,
  AddPerformanceIndexes1784400000000,
  AddBookmarks1784500000000,
];
