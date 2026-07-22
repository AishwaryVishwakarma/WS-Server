import {NestFactory} from '@nestjs/core';
import {DataSource} from 'typeorm';
import {AppModule} from 'src/app.module';
import {BookmarksService} from 'src/bookmarks/bookmarks.service';
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
    // Deterministic placeholder avatars (DiceBear) so the byline demonstrates
    // the profile-picture path. Carol is left imageless on purpose to exercise
    // the initial-letter fallback.
    profileImageUrl:
      'https://api.dicebear.com/9.x/thumbs/svg?seed=Alice%20Mortlake',
  },
  {
    name: 'Bob Greaves',
    email: 'bob@whisperingshadows.dev',
    isVerified: true,
    bio: 'I write down what the river tells me.',
    profileImageUrl:
      'https://api.dicebear.com/9.x/thumbs/svg?seed=Bob%20Greaves',
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
  'supernatural',
  'gothic',
  'urban-legend',
  'creature',
  'cosmic-horror',
  'cursed-objects',
  'body-horror',
  'survival',
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
    title: 'Unfinished Business (draft)',
    content:
      'I have been putting off writing this one down, because naming a thing invites it. ' +
      'But the scratching at the study door has grown impatient, and I think it wants its story told properly.\n\n' +
      'TODO: decide whether the ending happens to the narrator or to the reader.',
    scareLevel: 3,
    tags: ['psychological'],
    status: StoryStatus.Draft,
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

// ---------------------------------------------------------------------------
// Generated bulk data — deterministic (index-rotated, no randomness) filler on
// top of the handcrafted stories so every paginated surface has 2+ pages:
// the public feed and admin list (>20 stories), Alice's /me shelf (>20 of her
// own), and one story with >20 comments.
// ---------------------------------------------------------------------------

const TITLE_ADJECTIVES = [
  'The Waiting',
  'The Hollow',
  'The Patient',
  'The Unlit',
  'The Borrowed',
  'The Crooked',
];

const TITLE_NOUNS = [
  'Stairwell',
  'Orchard',
  'Congregation',
  'Reservoir',
  'Nursery',
  'Archive',
];

const OPENINGS = [
  'It started, as these things do, with something small: a door that took two tries to close, a draught with no window to explain it, a neighbour who waved a moment too long.',
  'Nobody in town will give you directions there after sundown. They will talk about the weather, about the harvest, about anything else, and their eyes will keep flicking to the road behind you.',
  'My grandmother left me the house, the clocks, and a list of rules written on the back of a hymn sheet. The first rule was underlined three times: *keep counting*.',
  'The photographs came back from the developer with an extra frame at the end of the roll — a picture none of us remembered taking, of a room none of us recognised.',
  'For eleven nights running, the dogs on our street barked at exactly the same minute, then stopped all at once, as if a hand had been raised.',
  'The renovation was meant to take six weeks. The builders left in four days, and they left their tools, which the foreman later told me, quietly, was cheaper than going back.',
];

const MIDDLES = [
  'I did what anyone would do: I kept a log. Dates, times, temperatures. The entries look sane until the second week, when my handwriting starts leaning the wrong way — and I do not remember writing any of them after the 14th.\n\nThe log now updates itself. It is more disciplined than I ever was.',
  'We asked the oldest resident about it. She laughed until she understood we were serious, and then she asked us, very carefully, which of us had spoken to it first, because that person would need to start wearing iron.\n\nNone of us could remember who had spoken first. That, she said, was the worst possible answer.',
  'The library keeps the town records in a basement that the staff call, without any humour at all, the deep end. The ledger for that year is there, and the relevant page has been cut out — not torn, cut, with a ruler, by someone who wanted it known that this was a decision.\n\n## What the ledger did keep\n\nThe index survived. It lists the missing page under a single word: *returned*.',
  'I tried to photograph it, of course. The pictures develop fine except for a smear of light in the corner, always the same corner, no matter which way I face the camera.\n\nMy phone has started cropping the corner out on its own. The manufacturer says there is no feature that does that.',
  'There is a version of this story where I moved out, and I tell that version at dinner parties. In the true version the rent is very reasonable, the rooms are warm, and every evening at dusk something in the house exhales, slowly, like a swimmer surfacing.\n\nYou can live with anything, is the thing. You can live with almost anything.',
  'The priest came, blessed the doorways, drank two cups of tea, and left in good spirits. That night the blessing was returned, neatly, written in condensation on the inside of every window, in Latin, in a hand nobody in this century was taught.',
];

const QUOTES = [
  '> Whatever knocks, my mother used to say, is asking permission. Whatever walks in never knocked.',
  '> The dead are not patient. They are punctual. There is a difference, and it matters enormously.',
  '> A house remembers its first family the way a bell remembers being struck.',
  '> Do not thank it. Thanking it finishes the transaction.',
];

const ENDINGS = [
  'I am writing this down because the entries in the log have started describing tomorrow, and I want at least one account of these events that something else did not author.\n\nIf you read this and recognise your own street: start counting.',
  'We sold the house in the spring. The new owners seem happy. They repainted, of course.\n\nThey always repaint.',
  'The town has since put up a fence and a sign. The fence is for the tourists. The sign, if you read it from the far side, is for something else.',
  'I still have the key. Some nights it is warm in the drawer, like a coin held too long in a hand, and on those nights I do not open the drawer.',
  'If this reads like a warning, good. It cost me a great deal to be in a position to give it.',
];

const GENERATED_AUTHOR_ROTATION = [
  'alice@whisperingshadows.dev',
  'bob@whisperingshadows.dev',
  'alice@whisperingshadows.dev',
  'carol@whisperingshadows.dev',
];

// Every 9th story stays pending / rejected / flagged so moderation surfaces
// have depth too; everything else is approved for the public feed.
function generatedStatus(index: number): StoryStatus {
  if (index % 9 === 8) return StoryStatus.Pending;
  if (index % 9 === 4 && index > 9) return StoryStatus.Approved;
  if (index === 17) return StoryStatus.Rejected;
  if (index === 26) return StoryStatus.Flagged;
  return StoryStatus.Approved;
}

function generateStories(): typeof STORIES {
  return Array.from({length: 36}, (_, i) => {
    const title = `${TITLE_ADJECTIVES[i % 6]} ${TITLE_NOUNS[Math.floor(i / 6)]}`;

    const content = [
      OPENINGS[i % OPENINGS.length],
      MIDDLES[i % MIDDLES.length],
      QUOTES[i % QUOTES.length],
      MIDDLES[(i + 3) % MIDDLES.length],
      ENDINGS[i % ENDINGS.length],
    ].join('\n\n');

    return {
      author: GENERATED_AUTHOR_ROTATION[i % 4],
      title,
      content,
      scareLevel: (i % 5) + 1,
      // Two distinct tags each, so stories are multi-tagged and every tag in
      // the catalogue picks up a healthy story count.
      tags: [
        TAG_NAMES[i % TAG_NAMES.length],
        TAG_NAMES[(i + 4) % TAG_NAMES.length],
      ],
      status: generatedStatus(i),
    };
  });
}

const COMMENT_REACTIONS = [
  'Read this alone at 2 a.m. Regretting my choices.',
  'The pacing on this one is merciless. Loved it.',
  'I had to check my own windows halfway through.',
  'This is going to live in my head rent-free. Like the thing in the story.',
  'Quietly the scariest thing on the shelves this month.',
  'The detail about the repainting broke me.',
  'I did not breathe for the last three paragraphs.',
  'The ending recontextualises the whole thing. Chef’s kiss.',
  'My smart speaker turned itself on while I was reading this. Coincidence, surely.',
  'Sent this to my sister. She has stopped speaking to me. Worth it.',
  'The restraint here is the scary part — it never over-explains.',
  'Bookmarking to never read again.',
];

// Only approved stories — a member can't comment on one they can't see
// (pending/rejected/flagged are gated to their author/admin).
const SPREAD_COMMENT_TARGETS = [
  "The Ferryman's Toll",
  'Whisper in the Walls',
  'Cold Spots',
];

// A couple of comments on several other stories, so discussion lives on more
// than one thread (each of the feed's stories, not just Hollow Lane).
function spreadComments(): typeof COMMENTS {
  const voices = [
    'bob@whisperingshadows.dev',
    'carol@whisperingshadows.dev',
    'alice@whisperingshadows.dev',
  ];
  let line = 0;
  return SPREAD_COMMENT_TARGETS.flatMap((story, t) =>
    Array.from({length: 2}, (_, i) => ({
      story,
      author: voices[(t + i) % voices.length],
      content: COMMENT_REACTIONS[line++ % COMMENT_REACTIONS.length],
    }))
  );
}

// Pile comments onto one story so its thread paginates.
function generateComments(): typeof COMMENTS {
  const commenters = [
    'alice@whisperingshadows.dev',
    'bob@whisperingshadows.dev',
    'carol@whisperingshadows.dev',
  ];

  return Array.from({length: 24}, (_, i) => ({
    story: 'The House on Hollow Lane',
    author: commenters[i % commenters.length],
    content: `${COMMENT_REACTIONS[i % COMMENT_REACTIONS.length]} (${i + 1})`,
  }));
}

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

// A few replies to existing comments so the /me activity feed shows real
// engagement (replyCount > 0 on the comments people started) and the one-level
// thread view has content. Matched to the handcrafted COMMENTS by content.
const REPLIES: {
  parentContent: string;
  story: string;
  author: string;
  content: string;
}[] = [
  {
    parentContent: 'Folk horror done right. The last line is perfect.',
    story: "The Ferryman's Toll",
    author: 'carol@whisperingshadows.dev',
    content: 'Agreed — that ending recontextualises the whole custom.',
  },
  {
    parentContent: 'Folk horror done right. The last line is perfect.',
    story: "The Ferryman's Toll",
    author: 'bob@whisperingshadows.dev',
    content: 'Thank you — the toll was the seed the whole story grew from.',
  },
  {
    parentContent: 'The sealed attic detail got me. Excellent pacing.',
    story: 'The House on Hollow Lane',
    author: 'alice@whisperingshadows.dev',
    content: 'That was the very image I started from. Glad it landed.',
  },
];

// A few member-reported comments so the admin moderation queue
// (GET /admin/comments?flagged=true) has content. Reporters must differ from
// the comment's author (self-reports are rejected); the differing report
// counts exercise the most-reported-first ordering. Matched to the handcrafted
// COMMENTS above by their (unique) content.
const REPORTS: {commentContent: string; reporters: string[]}[] = [
  {
    commentContent: 'What happens if the bulb just burns out?',
    reporters: ['alice@whisperingshadows.dev', 'bob@whisperingshadows.dev'],
  },
  {
    commentContent: 'I live near a Hollow Lane. Thanks, I hate it.',
    reporters: ['bob@whisperingshadows.dev'],
  },
];

// Reading-list saves, so /me and the bookmark toggles have data. Targets are
// approved stories (a member can only bookmark what they can see).
const BOOKMARKS: {reader: string; story: string}[] = [
  {reader: 'alice@whisperingshadows.dev', story: "The Ferryman's Toll"},
  {reader: 'alice@whisperingshadows.dev', story: 'Whisper in the Walls'},
  {reader: 'bob@whisperingshadows.dev', story: 'Whisper in the Walls'},
  {reader: 'carol@whisperingshadows.dev', story: "The Ferryman's Toll"},
];

async function wipeDatabase(dataSource: DataSource) {
  const tables: {table_name: string}[] = await dataSource.query(
    'SELECT table_name AS table_name FROM information_schema.tables WHERE table_schema = DATABASE()'
  );

  await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
  try {
    for (const {table_name} of tables) {
      // Preserve the migrations ledger — truncating it makes the next app boot
      // (migrationsRun) re-run migrations against tables that still exist and
      // fail. Mirrors cleanDatabase in the integration test helpers.
      if (table_name === 'migrations') continue;

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
    const bookmarksService = app.get(BookmarksService);

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

    for (const {author, status, tags, ...rest} of [
      ...STORIES,
      ...generateStories(),
    ]) {
      const story = await storiesService.create(
        {
          ...rest,
          tags: tags.map((name) => tagIdsByName.get(name)!),
          draft: status === StoryStatus.Draft,
        },
        usersByEmail.get(author)!.id,
        // Seed authors intentionally exceed the free publish limit (rich
        // feed/pagination data); the cap is a user-facing guard, not a
        // system-setup one.
        {enforcePublishLimit: false}
      );

      if (status !== StoryStatus.Pending && status !== StoryStatus.Draft) {
        await storiesService.updateStatus(story.id, status);
      }

      storyIdsByTitle.set(story.title, story.id);
      statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    }

    // Comments
    const allComments = [
      ...COMMENTS,
      ...generateComments(),
      ...spreadComments(),
    ];
    const commentIdsByContent = new Map<string, string>();
    for (const {story, author, content} of allComments) {
      const comment = await commentsService.create(
        {content, storyId: storyIdsByTitle.get(story)!},
        usersByEmail.get(author)!.id,
        Role.User
      );
      commentIdsByContent.set(content, comment.id);
    }

    // Replies (created through the real service with a parentId so the
    // one-level re-rooting and story commentCount stay correct)
    for (const {parentContent, story, author, content} of REPLIES) {
      const parentId = commentIdsByContent.get(parentContent);
      if (!parentId) continue;
      await commentsService.create(
        {content, storyId: storyIdsByTitle.get(story)!, parentId},
        usersByEmail.get(author)!.id,
        Role.User
      );
    }

    // Reports (through the real service so isFlagged/reportCount and the
    // per-member unique constraint behave exactly as in production)
    let reportedComments = 0;
    for (const {commentContent, reporters} of REPORTS) {
      const commentId = commentIdsByContent.get(commentContent);
      if (!commentId) continue;
      for (const email of reporters) {
        await commentsService.report(commentId, usersByEmail.get(email)!.id);
      }
      reportedComments++;
    }

    // Bookmarks (through the real service so the visibility check and the
    // per-member unique constraint behave as in production)
    let bookmarks = 0;
    for (const {reader, story} of BOOKMARKS) {
      const storyId = storyIdsByTitle.get(story);
      const readerId = usersByEmail.get(reader)?.id;
      if (!storyId || !readerId) continue;
      await bookmarksService.add(readerId, storyId);
      bookmarks++;
    }

    const statusSummary = [...statusCounts.entries()]
      .map(([status, count]) => `${count} ${status}`)
      .join(', ');

    log(
      `Seeded ${usersByEmail.size} users, ${tagIdsByName.size} tags, ` +
        `${storyIdsByTitle.size} stories (${statusSummary}), ` +
        `${allComments.length} comments + ${REPLIES.length} replies ` +
        `(${reportedComments} reported), ${bookmarks} bookmarks`
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
