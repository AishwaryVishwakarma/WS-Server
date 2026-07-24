import 'dotenv/config';
import {DataSource} from 'typeorm';
import {User} from 'src/users/entities/user.entity';
import {UserReport} from 'src/users/entities/user-report.entity';
import {Story} from 'src/stories/entities/story.entity';
import {StoryReport} from 'src/stories/entities/story-report.entity';
import {Tag} from 'src/tags/entities/tag.entity';
import {Comment} from 'src/comments/entities/comment.entity';
import {CommentReport} from 'src/comments/entities/comment-report.entity';
import {Notification} from 'src/notifications/entities/notification.entity';
import {Bookmark} from 'src/bookmarks/entities/bookmark.entity';
import {Follow} from 'src/follows/entities/follow.entity';
import {StoryLike} from 'src/likes/entities/story-like.entity';
import {migrations} from './migrations';

// CLI-facing DataSource for the typeorm binary (migration:generate/run/
// revert — see package.json scripts, which run it from dist). The runtime
// app configures its own connection in app.module.ts; keep the two in sync.
export default new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [
    User,
    UserReport,
    Story,
    StoryReport,
    Tag,
    Comment,
    CommentReport,
    Notification,
    Bookmark,
    Follow,
    StoryLike,
  ],
  migrations,
});
