import {DataSource} from 'typeorm';
import {
  Agent,
  cleanDatabase,
  closeTestApp,
  createTestApp,
  seedAdmin,
  TestApp,
} from './test-utils';

describe('admin analytics', () => {
  let testApp: TestApp;
  let dataSource: DataSource;
  let admin: Agent;

  beforeAll(async () => {
    testApp = await createTestApp();
    dataSource = testApp.dataSource;
  });
  beforeEach(async () => {
    await cleanDatabase(dataSource);
    admin = await seedAdmin(testApp);
  });
  afterAll(async () => closeTestApp(testApp));

  it('returns zero-filled trends and supports CSV export', async () => {
    const overview = await admin.get('/admin/analytics?range=7').expect(200);
    expect((overview.body as {trends: unknown[]}).trends).toHaveLength(7);
    expect((overview.body as {rangeDays: number}).rangeDays).toBe(7);
    await admin
      .get('/admin/analytics/export.csv?range=7')
      .expect('Content-Type', /text\/csv/)
      .expect(200);
  });

  it('can use the event time-range index', async () => {
    await dataSource.query('SET enable_seqscan = off');
    const [plan] = await dataSource.query<
      {plan: Array<Record<string, unknown>>}[]
    >(
      `EXPLAIN (ANALYZE, FORMAT JSON) SELECT COUNT(*) FROM analytics_event WHERE type = 'story_viewed' AND "createdAt" >= now() - interval '30 days'`
    );
    await dataSource.query('SET enable_seqscan = on');
    expect(JSON.stringify(Object.values(plan))).toContain(
      'IDX_analytics_event_type_createdAt'
    );
  });
});
