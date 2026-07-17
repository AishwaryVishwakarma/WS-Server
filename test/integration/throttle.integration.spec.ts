import request from 'supertest';
import {closeTestApp, createTestApp, type TestApp} from './test-utils';

// Rate limiting is off in the normal test env (THROTTLE_DISABLED=true in
// .env.test) because ordinary flows fire far more requests than any tier
// allows. This suite flips it off *before* booting so the guard is live —
// ConfigModule won't override an already-set value, so the assignment survives
// app boot — then restores it in afterAll so later suites keep skipping.
describe('Rate limiting (integration)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    process.env.THROTTLE_DISABLED = 'false';
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(testApp);
    process.env.THROTTLE_DISABLED = 'true';
  });

  it('caps the auth tier at 10/min, then 429s (brute-force protection)', async () => {
    const server = testApp.app.getHttpServer();
    const attempt = () =>
      request(server)
        .post('/auth/login')
        .send({email: 'nobody@test.com', password: 'wrong-password'});

    // AUTH_THROTTLE = 10/min, tracked per IP for anonymous callers (all these
    // share the loopback IP). The first 10 reach the handler (401 on bad
    // creds); the guard blocks the 11th before it.
    for (let i = 0; i < 10; i++) {
      const res = await attempt();
      expect(res.status).not.toBe(429);
    }

    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    // The client is told when it can retry.
    expect(blocked.headers['retry-after']).toBeDefined();
  });
});
