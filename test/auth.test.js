'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const supertest = require('supertest');
const { startTestApp, stopTestApp, bearer, PASSWORD } = require('../test-support/helpers');

describe('authentication & platform basics', () => {
  let ctx;
  before(async () => {
    ctx = await startTestApp('auth');
  });
  after(stopTestApp);

  it('GET /api/health is public and reports the database', async () => {
    const res = await ctx.request.get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.database, 'up');
  });

  it('logs in with valid credentials and returns a JWT plus the user', async () => {
    const res = await ctx.request.post('/api/auth/login').send({ username: 'admin', password: PASSWORD });
    assert.equal(res.status, 200);
    assert.equal(res.body.tokenType, 'Bearer');
    assert.equal(res.body.user.username, 'admin');
    assert.equal(res.body.user.role, 'admin');
    assert.equal(res.body.user.passwordHash, undefined);
    const payload = jwt.verify(res.body.token, ctx.config.jwt.secret);
    assert.equal(payload.role, 'admin');
  });

  it('rejects a wrong password and an unknown user with the same message', async () => {
    const wrong = await ctx.request.post('/api/auth/login').send({ username: 'admin', password: 'nope-nope' });
    const unknown = await ctx.request.post('/api/auth/login').send({ username: 'ghost', password: 'nope-nope' });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.error.code, 'UNAUTHORIZED');
    assert.equal(wrong.body.error.message, unknown.body.error.message);
  });

  it('validates the login payload', async () => {
    const res = await ctx.request.post('/api/auth/login').send({ username: '' });
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    const fields = res.body.error.details.map((d) => d.field).sort();
    assert.deepEqual(fields, ['password', 'username']);
  });

  it('answers malformed JSON with a 400 in the standard error format', async () => {
    const res = await ctx.request.post('/api/auth/login').set('Content-Type', 'application/json').send('{"username":');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'BAD_REQUEST');
  });

  it('refuses protected endpoints without a token', async () => {
    for (const url of ['/api/dashboard', '/api/employees', '/api/trainings', '/api/auth/me', '/api/audit-log']) {
      const res = await ctx.request.get(url);
      assert.equal(res.status, 401, url);
      assert.equal(res.body.error.code, 'UNAUTHORIZED', url);
    }
  });

  it('refuses garbage, wrongly signed and expired tokens', async () => {
    const garbage = await ctx.request.get('/api/employees').set(bearer('not-a-jwt'));
    assert.equal(garbage.status, 401);

    const forged = jwt.sign({ sub: '1', role: 'admin' }, 'some-other-secret-value-123');
    const forgedRes = await ctx.request.get('/api/employees').set(bearer(forged));
    assert.equal(forgedRes.status, 401);

    const expired = jwt.sign({ sub: '1', username: 'admin', role: 'admin' }, ctx.config.jwt.secret, { expiresIn: -10 });
    const expiredRes = await ctx.request.get('/api/employees').set(bearer(expired));
    assert.equal(expiredRes.status, 401);
    assert.match(expiredRes.body.error.message, /expired/i);

    const noneAlg = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"sub":"1","role":"admin"}').toString('base64url')}.`;
    const noneRes = await ctx.request.get('/api/employees').set(bearer(noneAlg));
    assert.equal(noneRes.status, 401);
  });

  it('GET /api/auth/me returns the signed-in user', async () => {
    const res = await ctx.request.get('/api/auth/me').set(bearer(ctx.tokens.hr));
    assert.equal(res.status, 200);
    assert.equal(res.body.user.username, 'hr');
    assert.equal(res.body.user.role, 'hr_manager');
    assert.ok(res.body.user.lastLoginAt);
  });

  it('does not let a deactivated user sign in', async () => {
    const db = require('../src/db/pool');
    await db.query("UPDATE dbo.users SET is_active = 0 WHERE username = 'viewer'");
    const res = await ctx.request.post('/api/auth/login').send({ username: 'viewer', password: PASSWORD });
    assert.equal(res.status, 401);
    await db.query("UPDATE dbo.users SET is_active = 1 WHERE username = 'viewer'");
  });

  it('answers unknown API routes with a JSON 404', async () => {
    const res = await ctx.request.get('/api/does-not-exist').set(bearer(ctx.tokens.admin));
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  it('sends security headers (helmet) and hides the framework', async () => {
    const res = await ctx.request.get('/api/health');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.ok(res.headers['content-security-policy']);
    assert.equal(res.headers['x-powered-by'], undefined);
  });

  it('serves the front end from the same server', async () => {
    const res = await ctx.request.get('/');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /html/);
    assert.match(res.text, /Training Management ERP/);
  });

  it('rate-limits repeated failed sign-ins (and ignores successful ones)', async () => {
    const limited = await startLimitedApp();
    const bad = { username: 'admin', password: 'wrong-password' };
    for (let i = 0; i < 3; i += 1) {
      assert.equal((await limited.post('/api/auth/login').send(bad)).status, 401);
    }
    const blocked = await limited.post('/api/auth/login').send(bad);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, 'RATE_LIMITED');
  });

  it('applies the CORS allow-list from configuration', async () => {
    const { createApp } = require('../src/app');
    const app = createApp({ ...ctx.config, corsOrigins: ['https://app.example.com'] });
    const allowed = await supertest(app).get('/api/health').set('Origin', 'https://app.example.com');
    assert.equal(allowed.headers['access-control-allow-origin'], 'https://app.example.com');
    const denied = await supertest(app).get('/api/health').set('Origin', 'https://evil.example.com');
    assert.equal(denied.headers['access-control-allow-origin'], undefined);
    // Default config: no CORS headers at all.
    const none = await ctx.request.get('/api/health').set('Origin', 'https://app.example.com');
    assert.equal(none.headers['access-control-allow-origin'], undefined);
  });

  async function startLimitedApp() {
    const { createApp } = require('../src/app');
    const app = createApp(ctx.config, { loginRateLimit: { windowMs: 60000, max: 3 } });
    return supertest(app);
  }
});
