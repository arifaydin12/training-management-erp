'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  startTestApp,
  stopTestApp,
  bearer,
  employeePayload,
  trainingPayload,
  createEmployee,
  createTraining,
  PASSWORD,
} = require('../test-support/helpers');

describe('role-based access control', () => {
  let ctx;
  let employee;
  let training;
  before(async () => {
    ctx = await startTestApp('roles');
    employee = await createEmployee(ctx);
    training = await createTraining(ctx);
  });
  after(stopTestApp);

  it('viewer can read everything but write nothing', async () => {
    const t = ctx.tokens.viewer;
    for (const url of ['/api/dashboard', '/api/meta', '/api/employees', `/api/employees/${employee.id}`, '/api/trainings', `/api/trainings/${training.id}`]) {
      assert.equal((await ctx.request.get(url).set(bearer(t))).status, 200, url);
    }
    const csv = await ctx.request.get('/api/employees/export.csv').set(bearer(t));
    assert.equal(csv.status, 200);

    const writes = [
      ctx.request.post('/api/employees').set(bearer(t)).send(employeePayload()),
      ctx.request.put(`/api/employees/${employee.id}`).set(bearer(t)).send(employeePayload()),
      ctx.request.delete(`/api/employees/${employee.id}`).set(bearer(t)),
      ctx.request.post('/api/trainings').set(bearer(t)).send(trainingPayload()),
      ctx.request.put(`/api/trainings/${training.id}`).set(bearer(t)).send(trainingPayload()),
      ctx.request.post(`/api/trainings/${training.id}/status`).set(bearer(t)).send({ status: 'in_progress' }),
      ctx.request.post(`/api/trainings/${training.id}/participants`).set(bearer(t)).send({ employeeId: employee.id }),
      ctx.request.delete(`/api/trainings/${training.id}`).set(bearer(t)),
    ];
    for (const res of await Promise.all(writes)) {
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    }
  });

  it('hr_manager can create and edit but not delete', async () => {
    const t = ctx.tokens.hr;
    const created = await ctx.request.post('/api/employees').set(bearer(t)).send(employeePayload());
    assert.equal(created.status, 201);
    const updated = await ctx.request
      .put(`/api/employees/${created.body.id}`)
      .set(bearer(t))
      .send(employeePayload({ jobTitle: 'Team Lead' }));
    assert.equal(updated.status, 200);
    assert.equal(updated.body.jobTitle, 'Team Lead');

    assert.equal((await ctx.request.delete(`/api/employees/${created.body.id}`).set(bearer(t))).status, 403);
    assert.equal((await ctx.request.delete(`/api/trainings/${training.id}`).set(bearer(t))).status, 403);
  });

  it('admin can delete', async () => {
    const t = ctx.tokens.admin;
    const e = await createEmployee(ctx);
    const tr = await createTraining(ctx);
    assert.equal((await ctx.request.delete(`/api/employees/${e.id}`).set(bearer(t))).status, 204);
    assert.equal((await ctx.request.delete(`/api/trainings/${tr.id}`).set(bearer(t))).status, 204);
    assert.equal((await ctx.request.get(`/api/employees/${e.id}`).set(bearer(t))).status, 404);
  });

  it('audit log and user management are admin-only', async () => {
    for (const role of ['hr', 'viewer']) {
      const t = ctx.tokens[role];
      assert.equal((await ctx.request.get('/api/audit-log').set(bearer(t))).status, 403, role);
      assert.equal((await ctx.request.get('/api/users').set(bearer(t))).status, 403, role);
      assert.equal(
        (await ctx.request.post('/api/users').set(bearer(t)).send({ username: 'x1', fullName: 'X', password: PASSWORD, role: 'admin' })).status,
        403,
        role,
      );
    }
    assert.equal((await ctx.request.get('/api/audit-log').set(bearer(ctx.tokens.admin))).status, 200);
  });

  it('admin can create a user, who can then sign in with the assigned role', async () => {
    const t = ctx.tokens.admin;
    const created = await ctx.request
      .post('/api/users')
      .set(bearer(t))
      .send({ username: 'new.viewer', fullName: 'New Viewer', password: 'Another-Pass-9', role: 'viewer' });
    assert.equal(created.status, 201);
    assert.equal(created.body.passwordHash, undefined);
    assert.equal(created.body.role, 'viewer');

    const dup = await ctx.request
      .post('/api/users')
      .set(bearer(t))
      .send({ username: 'new.viewer', fullName: 'Again', password: 'Another-Pass-9', role: 'viewer' });
    assert.equal(dup.status, 409);

    const login = await ctx.request.post('/api/auth/login').send({ username: 'new.viewer', password: 'Another-Pass-9' });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.role, 'viewer');

    const bad = await ctx.request
      .post('/api/users')
      .set(bearer(t))
      .send({ username: 'a', fullName: '', password: 'short', role: 'superuser' });
    assert.equal(bad.status, 422);
    assert.equal(bad.body.error.details.length, 4);
  });

  it('stores passwords as bcrypt hashes', async () => {
    const db = require('../src/db/pool');
    const rows = await db.query('SELECT password_hash FROM dbo.users');
    assert.ok(rows.recordset.length >= 3);
    for (const r of rows.recordset) assert.match(r.password_hash, /^\$2[aby]\$\d{2}\$/);
  });
});
