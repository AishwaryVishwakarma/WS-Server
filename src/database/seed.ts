import {NestFactory} from '@nestjs/core';
import {DataSource} from 'typeorm';
import {AppModule} from 'src/app.module';
import {CommentsService} from 'src/comments/comments.service';
import {StoriesService} from 'src/stories/stories.service';
import {StoryStatus} from 'src/stories/enums/story-status.enum';
import {TagsService} from 'src/tags/tags.service';
import {CreateUserDto} from 'src/users/dto/create-user.dto';
import {User} from 'src/users/entities/user.entity';
import {Role} from 'src/users/enums/role';
import {UsersService} from 'src/users/users.service';

// The Nest Logger is muted below ({logger: ['error', 'warn']}) to hide
// bootstrap noise, so the seeder reports via console directly.
const log = (message: string) => console.log(`[seed] ${message}`);

export const ADMIN_CREDENTIALS = {
  email: 'admin@whisperingshadows.dev',
  password: 'Adm1n!Shadows',
};

export const WRITER_PASSWORD = 'Wr1ter!Shadows';

const WRITERS = [
  {
    name: 'Alice Mortlake',
    email: 'alice@whisperingshadows.dev',
    isVerified: true,
    bio: 'Collector of small-town hauntings.',
  },
  {
    name: 'Bob Greaves',
    email: 'bob@whisperingshadows.dev',
    isVerified: true,
    bio: 'I write down what the river tells me.',
  },
  {
    name: 'Carol Finch',
    email: 'carol@whisperingshadows.dev',
    isVerified: false,
    bio: 'New here. The walls suggested I sign up.',
  },
  {
    name: 'Dave Hollow',
    email: 'dave@whisperingshadows.dev',
    isVerified: true,
    isBlocked: true,
    bio: 'Currently unavailable.',
  },
];

const TAG_NAMES = [
  'horror',
  'paranormal',
  'psychological',
  'folk-tale',
  'haunted-places',
];

const STORIES: {
  author: string;
  title: string;
  content: string;
  excerpt?: string;
  scareLevel: number;
  tags: string[];
  status: StoryStatus;
}[] = [
  {
    author: 'alice@whisperingshadows.dev',
    title: 'The House on Hollow Lane',
    content:
      'The house on Hollow Lane had been empty for eleven years, which is why nobody could explain the light in the attic window. ' +
      'It appeared every night at 3:11 a.m., burned for exactly four minutes, and went out. The new owners found the attic sealed from the inside, ' +
      'nails driven through the hatch at angles no hammer could reach. On the floor, in chalk, someone had written the same sentence forty times: ' +
      'THE LIGHT KEEPS IT ASLEEP. They repainted, of course. They always repaint. And that first dark night, at 3:11, the whole street woke to the sound of something enormous stretching.',
    excerpt:
      'Every night at 3:11 a.m., the attic light comes on. No one has lived there for eleven years.',
    scareLevel: 4,
    tags: ['horror', 'haunted-places'],
    status: StoryStatus.Approved,
  },
  {
    author: 'alice@whisperingshadows.dev',
    title: 'Static',
    content:
      'My daughter says the baby monitor sings to her. I recorded it for a week and heard nothing but static. ' +
      'Then I played the recordings backwards, all seven nights spliced together, and it was not singing. It was counting. ' +
      'Last night it reached one.',
    scareLevel: 2,
    tags: ['psychological'],
    status: StoryStatus.Pending,
  },
  {
    author: 'bob@whisperingshadows.dev',
    title: "The Ferryman's Toll",
    content:
      'Our village keeps an old custom: two coins in the pocket of anyone who crosses the river after dark. My grandfather called it superstition and crossed with empty pockets, laughing. ' +
      'The ferryman brought back his boat, his coat, and his boots, and would not meet our eyes. We pay double now. Not for safety — for the ones already taken, so they might one day afford the trip home. ' +
      'On quiet nights you can hear them on the far bank, going through their pockets, counting what they have saved.',
    excerpt:
      'Cross the river after dark with empty pockets and the ferryman returns alone.',
    scareLevel: 3,
    tags: ['folk-tale'],
    status: StoryStatus.Approved,
  },
  {
    author: 'bob@whisperingshadows.dev',
    title: 'Do Not Answer After Midnight',
    content:
      'The phone in the hallway is not connected to anything. I checked. I cut the cable myself and left the frayed end hanging. ' +
      'It rang again at 12:40. This time my wife answered before I could stop her. She listened for a long time, nodded, and hung up. ' +
      'She has been very polite to me since. Too polite. Tonight I found a note in her handwriting that says WHEN IT RINGS AGAIN IT IS FOR YOU.',
    scareLevel: 5,
    tags: ['horror'],
    status: StoryStatus.Flagged,
  },
  {
    author: 'carol@whisperingshadows.dev',
    title: 'Whisper in the Walls',
    content:
      'The estate agent said the scratching was mice. Mice do not whisper your name. Mice do not slide handwritten apologies under the wallpaper, ' +
      'in handwriting that matches the previous owner, who — the neighbours swear — moved out in a hurry and left everything, even her shoes. ' +
      'I have started writing back. I slide my notes behind the loose skirting board, and in the morning they are gone. Yesterday the wall asked, very politely, whether I sleep on my back or my side.',
    scareLevel: 3,
    tags: ['paranormal', 'horror'],
    status: StoryStatus.Approved,
  },
  {
    author: 'carol@whisperingshadows.dev',
    title: 'The Last Lighthouse Keeper',
    content:
      'They automated the lighthouse in 1974, but old Maren kept rowing out every Sunday to polish the lens. Habit, she said. ' +
      'When she died the light began turning the wrong way, sweeping the land instead of the sea, as if looking for her. ' +
      'The coastguard sends engineers. The engineers send apologies.',
    scareLevel: 2,
    tags: [],
    status: StoryStatus.Rejected,
  },
  {
    author: 'dave@whisperingshadows.dev',
    title: 'Cold Spots',
    content:
      'The thermostat says 22 degrees, but there is a corridor of winter running through my kitchen, exactly the width of a person. ' +
      'It moves a little each day, the way a queue moves. This morning it was pressed against the cellar door. ' +
      'I have started leaving the door open a crack, out of courtesy. The cold spot has started leaving me small dead birds, possibly for the same reason.',
    scareLevel: 1,
    tags: ['paranormal'],
    status: StoryStatus.Approved,
  },
  {
    author: 'alice@whisperingshadows.dev',
    title: 'Mirror Math',
    content:
      'There are five mirrors in my flat. I counted them when I moved in, the way you do. Last Tuesday there were six. ' +
      'I removed one — the new one, I was sure it was the new one — and now there are four reflections of me and one of somebody standing very still, ' +
      'slightly too far to the left, waiting for me to stop counting.',
    scareLevel: 4,
    tags: ['psychological', 'horror'],
    status: StoryStatus.Pending,
  },
];

const COMMENTS: {story: string; author: string; content: string}[] = [
  {
    story: 'The House on Hollow Lane',
    author: 'bob@whisperingshadows.dev',
    content: 'The sealed attic detail got me. Excellent pacing.',
  },
  {
    story: 'The House on Hollow Lane',
    author: 'carol@whisperingshadows.dev',
    content: 'I live near a Hollow Lane. Thanks, I hate it.',
  },
  {
    story: 'The House on Hollow Lane',
    author: 'dave@whisperingshadows.dev',
    content: 'What happens if the bulb just burns out?',
  },
  {
    story: "The Ferryman's Toll",
    author: 'alice@whisperingshadows.dev',
    content: 'Folk horror done right. The last line is perfect.',
  },
  {
    story: "The Ferryman's Toll",
    author: 'carol@whisperingshadows.dev',
    content: 'Paying for the dead to come home is such a chilling idea.',
  },
  {
    story: 'Whisper in the Walls',
    author: 'bob@whisperingshadows.dev',
    content: 'Do NOT answer the sleeping question.',
  },
  {
    story: 'Whisper in the Walls',
    author: 'alice@whisperingshadows.dev',
    content: 'The politeness makes it so much worse.',
  },
  {
    story: 'Cold Spots',
    author: 'carol@whisperingshadows.dev',
    content: 'A queue of one, moving toward the cellar. Brilliant.',
  },
  {
    story: 'Cold Spots',
    author: 'bob@whisperingshadows.dev',
    content: 'The dead birds as gifts... like a cat. A cold, invisible cat.',
  },
  {
    story: 'Cold Spots',
    author: 'alice@whisperingshadows.dev',
    content: 'Genuinely charming and unsettling at once.',
  },
];

async function wipeDatabase(dataSource: DataSource) {
  const tables: {table_name: string}[] = await dataSource.query(
    'SELECT table_name AS table_name FROM information_schema.tables WHERE table_schema = DATABASE()'
  );

  await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const {table_name} of tables) {
      await dataSource.query(`TRUNCATE TABLE \`${table_name}\``);
    }
  } finally {
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');
  }
}

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production environment');
  }

  const fresh = process.argv.includes('--fresh');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const dataSource = app.get(DataSource);
    const usersService = app.get(UsersService);
    const tagsService = app.get(TagsService);
    const storiesService = app.get(StoriesService);
    const commentsService = app.get(CommentsService);

    const existingAdmin = await dataSource
      .getRepository(User)
      .findOneBy({email: ADMIN_CREDENTIALS.email});

    if (existingAdmin && !fresh) {
      log(
        'Database is already seeded — run "npm run seed -- --fresh" to wipe and reseed'
      );
      return;
    }

    if (fresh) {
      log(`Wiping database "${String(dataSource.options.database)}"...`);
      await wipeDatabase(dataSource);
    }

    // Users
    const admin = (await usersService.create({
      name: 'Site Admin',
      ...ADMIN_CREDENTIALS,
      role: Role.Admin,
      isVerified: true,
    } as CreateUserDto)) as User;

    const usersByEmail = new Map<string, User>([[admin.email, admin]]);

    for (const writer of WRITERS) {
      const user = (await usersService.create({
        ...writer,
        password: WRITER_PASSWORD,
      })) as User;
      usersByEmail.set(user.email, user);
    }

    // Tags
    const tagIdsByName = new Map<string, string>();
    for (const name of TAG_NAMES) {
      const tag = await tagsService.create({name});
      tagIdsByName.set(tag!.name, tag!.id);
    }

    // Stories (created through the real service, then moderated through the
    // real status transition so isFlagged etc. stay consistent)
    const storyIdsByTitle = new Map<string, string>();
    const statusCounts = new Map<StoryStatus, number>();

    for (const {author, status, tags, ...rest} of STORIES) {
      const story = await storiesService.create(
        {...rest, tags: tags.map((name) => tagIdsByName.get(name)!)},
        usersByEmail.get(author)!.id
      );

      if (status !== StoryStatus.Pending) {
        await storiesService.updateStatus(story.id, status);
      }

      storyIdsByTitle.set(story.title, story.id);
      statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    }

    // Comments
    for (const {story, author, content} of COMMENTS) {
      await commentsService.create(
        {content, storyId: storyIdsByTitle.get(story)!},
        usersByEmail.get(author)!.id,
        Role.User
      );
    }

    const statusSummary = [...statusCounts.entries()]
      .map(([status, count]) => `${count} ${status}`)
      .join(', ');

    log(
      `Seeded ${usersByEmail.size} users, ${tagIdsByName.size} tags, ` +
        `${storyIdsByTitle.size} stories (${statusSummary}), ${COMMENTS.length} comments`
    );
    log(
      `Admin login:  ${ADMIN_CREDENTIALS.email} / ${ADMIN_CREDENTIALS.password}`
    );
    log(
      `Writer login: alice|bob|carol@whisperingshadows.dev / ${WRITER_PASSWORD} (dave is blocked)`
    );
  } finally {
    await app.close();
  }
}

void seed().catch((error) => {
  console.error('[seed] Failed:', error);
  process.exitCode = 1;
});
