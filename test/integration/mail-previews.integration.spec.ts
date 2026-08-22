import request from 'supertest';
import {
  cleanDatabase,
  closeTestApp,
  createTestApp,
  registerUser,
  seedAdmin,
  type TestApp,
} from './test-utils';

describe('Mail previews (integration)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(async () => {
    await cleanDatabase(testApp.dataSource);
  });

  afterAll(async () => {
    await closeTestApp(testApp);
  });

  const agent = () => request.agent(testApp.app.getHttpServer());

  it('lists every known template for an admin', async () => {
    const admin = await seedAdmin(testApp);

    const response = await admin.get('/admin/mail-previews').expect(200);

    const names = (response.body as {name: string}[]).map((item) => item.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'password-reset',
        'registration-otp',
        'weekly-digest',
        'winback',
        'notification-reply',
        'notification-comment',
        'notification-follow',
        'notification-like',
        'notification-series',
      ]),
    );
  });

  it('renders a named template as a full HTML document', async () => {
    const admin = await seedAdmin(testApp);

    const response = await admin
      .get('/admin/mail-previews/weekly-digest')
      .expect(200);

    expect((response.body as {html: string}).html).toContain(
      '<!doctype html>',
    );
  });

  it('404s for an unknown template name', async () => {
    const admin = await seedAdmin(testApp);

    await admin.get('/admin/mail-previews/not-a-real-template').expect(404);
  });

  it('requires admin', async () => {
    const reader = agent();
    await registerUser(reader, {email: 'reader@test.com'});

    await reader.get('/admin/mail-previews').expect(403);
  });

  it('rejects a signed-out visitor', async () => {
    await agent().get('/admin/mail-previews').expect(401);
  });
});
