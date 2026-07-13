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

  it('confirms migrations own the schema (ledger table exists)', async () => {
    const rows: {name: string}[] = await testApp.dataSource.query(
      'SELECT name FROM migrations'
    );
    expect(rows.length).toBeGreaterThan(0);
  });
});
