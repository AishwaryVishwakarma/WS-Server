import 'dotenv/config';
import {DataSource} from 'typeorm';
import {User} from 'src/users/entities/user.entity';
import {Story} from 'src/stories/entities/story.entity';
import {Tag} from 'src/tags/entities/tag.entity';
import {Comment} from 'src/comments/entities/comment.entity';
import {CommentReport} from 'src/comments/entities/comment-report.entity';
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
  entities: [User, Story, Tag, Comment, CommentReport],
  migrations,
});
