import request from 'supertest';
import {MailService} from 'src/mail/mail.service';
import {User} from 'src/users/entities/user.entity';
import {StoryStatus} from 'src/stories/enums/story-status.enum';
import {
  cleanDatabase,
  closeTestApp,
  createTestApp,
  getCsrfToken,
  registerUser,
  seedAdmin,
  type TestApp,
} from './test-utils';

const STORY_PAYLOAD = {
  title: 'The Whispering Shadow',
  content: 'x'.repeat(500),
  scareLevel: 4,
};

describe('Weekly digest (integration)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase(testApp.dataSource);
  });

  afterEach(() => {
    // spyOnMail() wraps the same DI-managed MailService singleton in every
    // test — without restoring it, a later test's spy would still carry an
    // earlier test's recorded calls.
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await closeTestApp(testApp);
  });

  const agent = () => request.agent(testApp.app.getHttpServer());
  const userRepository = () => testApp.dataSource.getRepository(User);

  const spyOnMail = () => {
    const mailService = testApp.app.get(MailService);
    return jest.spyOn(mailService, 'send').mockResolvedValue(undefined);
  };

  // The site-wide digest toggle defaults off and cleanDatabase truncates the
  // settings row every test — flip it on wherever a test needs the digest to
  // actually run, using the same admin session the test already has.
  const enableDigest = (admin: ReturnType<typeof agent>, adminToken: string) =>
    admin
      .patch('/admin/settings')
      .set('x-csrf-token', adminToken)
      .send({digestEmailGloballyEnabled: true})
      .expect(200);

  it('emails a reader following an author with a new story, and records the send', async () => {
    const author = agent();
    const {body: authorBody} = await registerUser(author, {
      email: 'author@test.com',
    });
    const authorToken = await getCsrfToken(author);
    const {body: story} = await author
      .post('/stories')
      .set('x-csrf-token', authorToken)
      .send(STORY_PAYLOAD)
      .expect(201);

    const admin = await seedAdmin(testApp);
    const adminToken = await getCsrfToken(admin);
    await enableDigest(admin, adminToken);
    await admin
      .patch(`/admin/stories/${story.id}/status`)
      .set('x-csrf-token', adminToken)
      .send({status: StoryStatus.Approved})
      .expect(200);

    const reader = agent();
    const {body: readerBody} = await registerUser(reader, {
      email: 'reader@test.com',
    });
    const readerToken = await getCsrfToken(reader);
    await reader
      .put(`/users/${authorBody.id}/follow`)
      .set('x-csrf-token', readerToken)
      .expect(204);

    const sendMail = spyOnMail();

    const result = await admin
      .post('/admin/digest/send')
      .set('x-csrf-token', adminToken)
      .expect(201);

    expect(result.body.sent).toBeGreaterThanOrEqual(1);
    expect(sendMail).toHaveBeenCalledWith(
      'reader@test.com',
      'Your weekly whispers',
      expect.stringContaining(STORY_PAYLOAD.title),
      expect.any(String)
    );

    const updatedReader = await userRepository().findOneByOrFail({
      id: readerBody.id,
    });
    expect(updatedReader.lastDigestSentAt).not.toBeNull();
  });

  it('skips a user with nothing to report', async () => {
    const reader = agent();
    const {body: readerBody} = await registerUser(reader, {
      email: 'lonely@test.com',
    });

    const admin = await seedAdmin(testApp);
    const adminToken = await getCsrfToken(admin);
    await enableDigest(admin, adminToken);
    const sendMail = spyOnMail();

    await admin
      .post('/admin/digest/send')
      .set('x-csrf-token', adminToken)
      .expect(201);

    expect(sendMail).not.toHaveBeenCalledWith(
      'lonely@test.com',
      expect.anything(),
      expect.anything()
    );
    const updatedReader = await userRepository().findOneByOrFail({
      id: readerBody.id,
    });
    expect(updatedReader.lastDigestSentAt).toBeNull();
  });

  it('does not email a user who opted out', async () => {
    const author = agent();
    const {body: authorBody} = await registerUser(author, {
      email: 'author2@test.com',
    });
    const authorToken = await getCsrfToken(author);
    const {body: story} = await author
      .post('/stories')
      .set('x-csrf-token', authorToken)
      .send(STORY_PAYLOAD)
      .expect(201);

    const admin = await seedAdmin(testApp);
    const adminToken = await getCsrfToken(admin);
    await enableDigest(admin, adminToken);
    await admin
      .patch(`/admin/stories/${story.id}/status`)
      .set('x-csrf-token', adminToken)
      .send({status: StoryStatus.Approved})
      .expect(200);

    const reader = agent();
    await registerUser(reader, {email: 'optedout@test.com'});
    const readerToken = await getCsrfToken(reader);
    await reader
      .put(`/users/${authorBody.id}/follow`)
      .set('x-csrf-token', readerToken)
      .expect(204);
    await reader
      .patch('/users/me')
      .set('x-csrf-token', readerToken)
      .send({digestEmailEnabled: false})
      .expect(200);

    const sendMail = spyOnMail();
    await admin
      .post('/admin/digest/send')
      .set('x-csrf-token', adminToken)
      .expect(201);

    expect(sendMail).not.toHaveBeenCalledWith(
      'optedout@test.com',
      expect.anything(),
      expect.anything()
    );
  });

  it('sends nothing when digest is globally disabled, even for an otherwise-eligible reader', async () => {
    const author = agent();
    const {body: authorBody} = await registerUser(author, {
      email: 'author3@test.com',
    });
    const authorToken = await getCsrfToken(author);
    const {body: story} = await author
      .post('/stories')
      .set('x-csrf-token', authorToken)
      .send(STORY_PAYLOAD)
      .expect(201);

    const admin = await seedAdmin(testApp);
    const adminToken = await getCsrfToken(admin);
    // Deliberately not calling enableDigest — the setting defaults off.
    await admin
      .patch(`/admin/stories/${story.id}/status`)
      .set('x-csrf-token', adminToken)
      .send({status: StoryStatus.Approved})
      .expect(200);

    const reader = agent();
    const {body: readerBody} = await registerUser(reader, {
      email: 'reader3@test.com',
    });
    const readerToken = await getCsrfToken(reader);
    await reader
      .put(`/users/${authorBody.id}/follow`)
      .set('x-csrf-token', readerToken)
      .expect(204);

    const sendMail = spyOnMail();
    const result = await admin
      .post('/admin/digest/send')
      .set('x-csrf-token', adminToken)
      .expect(201);

    expect(result.body).toEqual({sent: 0});
    expect(sendMail).not.toHaveBeenCalled();
    const updatedReader = await userRepository().findOneByOrFail({
      id: readerBody.id,
    });
    expect(updatedReader.lastDigestSentAt).toBeNull();
  });

  it('requires admin', async () => {
    const reader = agent();
    const readerToken = await getCsrfToken(reader);
    await registerUser(reader, {email: 'reader@test.com'});

    await reader
      .post('/admin/digest/send')
      .set('x-csrf-token', readerToken)
      .expect(403);
  });
});
