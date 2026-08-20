import 'dotenv/config';
import {DataSource} from 'typeorm';
import {User} from 'src/users/entities/user.entity';
import {UserReport} from 'src/users/entities/user-report.entity';
import {PasswordResetToken} from 'src/auth/entities/password-reset-token.entity';
import {PendingRegistration} from 'src/auth/entities/pending-registration.entity';
import {Story} from 'src/stories/entities/story.entity';
import {StoryReport} from 'src/stories/entities/story-report.entity';
import {StoryRevision} from 'src/stories/entities/story-revision.entity';
import {RecommendationFeedback} from 'src/stories/entities/recommendation-feedback.entity';
import {Tag} from 'src/tags/entities/tag.entity';
import {Comment} from 'src/comments/entities/comment.entity';
import {CommentReport} from 'src/comments/entities/comment-report.entity';
import {Notification} from 'src/notifications/entities/notification.entity';
import {Bookmark} from 'src/bookmarks/entities/bookmark.entity';
import {Follow} from 'src/follows/entities/follow.entity';
import {StoryLike} from 'src/likes/entities/story-like.entity';
import {Series} from 'src/series/entities/series.entity';
import {SeriesSubscription} from 'src/series/entities/series-subscription.entity';
import {ReadingProgress} from 'src/reading-progress/entities/reading-progress.entity';
import {ScareVote} from 'src/scare-ratings/entities/scare-vote.entity';
import {MutedAuthor} from 'src/mutes/entities/muted-author.entity';
import {CommentReaction} from 'src/comment-reactions/entities/comment-reaction.entity';
import {SiteSettings} from 'src/settings/entities/site-settings.entity';
import {migrations} from './migrations';
import {AnalyticsEvent} from 'src/admin-analytics/entities/analytics-event.entity';

// CLI-facing DataSource for the typeorm binary (migration:generate/run/
// revert — see package.json scripts, which run it from dist). The runtime
// app configures its own connection in app.module.ts; keep the two in sync.
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  poolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10),
  maxQueryExecutionTime: parseInt(process.env.DB_SLOW_QUERY_MS || '500', 10),
  entities: [
    User,
    UserReport,
    Story,
    StoryReport,
    StoryRevision,
    RecommendationFeedback,
    Tag,
    Comment,
    CommentReport,
    Notification,
    Bookmark,
    Follow,
    StoryLike,
    PasswordResetToken,
    PendingRegistration,
    Series,
    SeriesSubscription,
    ReadingProgress,
    ScareVote,
    MutedAuthor,
    CommentReaction,
    SiteSettings,
    AnalyticsEvent,
  ],
  migrations,
});
