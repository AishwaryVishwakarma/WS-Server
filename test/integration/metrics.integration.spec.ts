import request from 'supertest';
import {closeTestApp, createTestApp, type TestApp} from './test-utils';

// Matches METRICS_TOKEN in .env.test.
const TOKEN = 'test-metrics-token';

describe('Metrics (integration)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(testApp);
  });

  const server = () => testApp.app.getHttpServer();

  it('rejects a scrape with no token', async () => {
    await request(server()).get('/metrics').expect(401);
  });

  it('rejects a scrape with the wrong token', async () => {
    await request(server())
      .get('/metrics')
      .set('Authorization', 'Bearer nope')
      .expect(401);
  });

  it('serves Prometheus metrics to an authorized scraper', async () => {
    const response = await request(server())
      .get('/metrics')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);

    // Default runtime metrics.
    expect(response.text).toContain('process_cpu_user_seconds_total');
    // HTTP, domain and dependency metrics are all registered.
    expect(response.text).toContain('ws_http_requests_total');
    expect(response.text).toContain('ws_http_request_duration_seconds');
    expect(response.text).toContain('ws_stories_by_status');
    expect(response.text).toContain('ws_flagged_comments');
    // Redis and DB are live under the test harness.
    expect(response.text).toMatch(/ws_db_up 1/);
    expect(response.text).toMatch(/ws_redis_up 1/);
  });

  it('counts HTTP traffic by route template', async () => {
    // Drive a real (non-excluded) route, then confirm the scrape recorded it.
    await request(server()).get('/stories').expect(200);

    const response = await request(server())
      .get('/metrics')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);

    expect(response.text).toMatch(
      /ws_http_requests_total\{[^}]*route="\/stories"[^}]*\}/
    );
  });
});
