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
import {AddStoryViewCount1784600000000} from './1784600000000-AddStoryViewCount';
import {AddFollows1784700000000} from './1784700000000-AddFollows';
import {AddStoryViewCountIndex1784800000000} from './1784800000000-AddStoryViewCountIndex';
import {AddFollowNotifications1784900000000} from './1784900000000-AddFollowNotifications';
import {AddStoryLikes1785000000000} from './1785000000000-AddStoryLikes';
import {AddStoryReports1785100000000} from './1785100000000-AddStoryReports';
import {AddStoryFulltextIndex1785200000000} from './1785200000000-AddStoryFulltextIndex';
import {AddGoogleAuth1785300000000} from './1785300000000-AddGoogleAuth';
import {AddUserReports1785400000000} from './1785400000000-AddUserReports';
import {AddUserReportReason1785500000000} from './1785500000000-AddUserReportReason';
import {AddPasswordResetToken1785600000000} from './1785600000000-AddPasswordResetToken';
import {AddSeries1785700000000} from './1785700000000-AddSeries';
import {AddUserVerificationTracking1785800000000} from './1785800000000-AddUserVerificationTracking';
import {AddStoryReportReason1785900000000} from './1785900000000-AddStoryReportReason';
import {AddContentWarningsAndRevisions1786000000000} from './1786000000000-AddContentWarningsAndRevisions';
import {AddStoryRejectionReason1786100000000} from './1786100000000-AddStoryRejectionReason';
import {AddReadingProgress1785429083383} from './1785429083383-AddReadingProgress';
import {AddCommentHiddenByAuthor1785431685812} from './1785431685812-AddCommentHiddenByAuthor';
import {AddStoryScheduledFor1785433843318} from './1785433843318-AddStoryScheduledFor';
import {AddScareVotes1785474118036} from './1785474118036-AddScareVotes';
import {AddMutedContentWarnings1785484220156} from './1785484220156-AddMutedContentWarnings';

export const migrations = [
  Baseline1783883957794,
  AddCommentParent1783938584720,
  AddCommentReports1784177051286,
  AddNotifications1784262275676,
  AddNotificationParentId1784350000000,
  AddPerformanceIndexes1784400000000,
  AddBookmarks1784500000000,
  AddStoryViewCount1784600000000,
  AddFollows1784700000000,
  AddStoryViewCountIndex1784800000000,
  AddFollowNotifications1784900000000,
  AddStoryLikes1785000000000,
  AddStoryReports1785100000000,
  AddStoryFulltextIndex1785200000000,
  AddGoogleAuth1785300000000,
  AddUserReports1785400000000,
  AddUserReportReason1785500000000,
  AddPasswordResetToken1785600000000,
  AddSeries1785700000000,
  AddUserVerificationTracking1785800000000,
  AddStoryReportReason1785900000000,
  AddContentWarningsAndRevisions1786000000000,
  AddStoryRejectionReason1786100000000,
  AddReadingProgress1785429083383,
  AddCommentHiddenByAuthor1785431685812,
  AddStoryScheduledFor1785433843318,
  AddScareVotes1785474118036,
  AddMutedContentWarnings1785484220156,
];
