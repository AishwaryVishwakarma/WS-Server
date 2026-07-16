import request from 'supertest';
import {closeTestApp, createTestApp, type TestApp} from './test-utils';

describe('Health (integration)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(testApp);
  });

  it('reports ok with a live database, anonymously', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(typeof response.body.uptime).toBe('number');
  });

  it('stamps every response with a generated X-Request-Id', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get('/health')
      .expect(200);

    // A UUID when the client did not supply one.
    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('echoes a valid client-supplied request id for end-to-end tracing', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get('/health')
      .set('x-request-id', 'trace-abc-123')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('trace-abc-123');
  });

  it('ignores an unsafe client-supplied request id and generates one', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get('/health')
      .set('x-request-id', 'bad id with spaces')
      .expect(200);

    expect(response.headers['x-request-id']).not.toBe('bad id with spaces');
    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('confirms migrations own the schema (ledger table exists)', async () => {
    const rows: {name: string}[] = await testApp.dataSource.query(
      'SELECT name FROM migrations'
    );
    expect(rows.length).toBeGreaterThan(0);
  });
});
