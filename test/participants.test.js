'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp, stopTestApp, bearer, createEmployee, createTraining, setStatus } = require('../test-support/helpers');

describe('participants, capacity, attendance, dashboard and audit log', () => {
  let ctx;
  const hr = () => bearer(ctx.tokens.hr);
  const enrol = (trainingId, employeeId, token = ctx.tokens.hr) =>
    ctx.request.post(`/api/trainings/${trainingId}/participants`).set(bearer(token)).send({ employeeId });

  before(async () => {
    ctx = await startTestApp('participants');
  });
  after(stopTestApp);

  it('enrols an employee and lists them as participant', async () => {
    const t = await createTraining(ctx, { capacity: 3 });
    const e = await createEmployee(ctx);
    const res = await enrol(t.id, e.id);
    assert.equal(res.status, 201);
    assert.equal(res.body.enrolledCount, 1);
    assert.equal(res.body.participants[0].employeeId, e.id);
    assert.equal(res.body.participants[0].status, 'enrolled');
    assert.deepEqual(res.body.summary, { enrolled: 1, attended: 0, completed: 0, absent: 0 });

    const list = await ctx.request.get(`/api/trainings/${t.id}/participants`).set(hr());
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.data[0].fullName, e.fullName);
  });

  it('protects against duplicate enrolment', async () => {
    const t = await createTraining(ctx);
    const e = await createEmployee(ctx);
    assert.equal((await enrol(t.id, e.id)).status, 201);
    const dup = await enrol(t.id, e.id);
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'ALREADY_ENROLLED');
    const detail = await ctx.request.get(`/api/trainings/${t.id}`).set(hr());
    assert.equal(detail.body.enrolledCount, 1);
  });

  it('enforces the capacity limit', async () => {
    const t = await createTraining(ctx, { capacity: 2 });
    const [a, b, c] = [await createEmployee(ctx), await createEmployee(ctx), await createEmployee(ctx)];
    assert.equal((await enrol(t.id, a.id)).status, 201);
    assert.equal((await enrol(t.id, b.id)).status, 201);
    const full = await enrol(t.id, c.id);
    assert.equal(full.status, 409);
    assert.equal(full.body.error.code, 'CAPACITY_FULL');

    // Freeing a seat makes room again.
    assert.equal((await ctx.request.delete(`/api/trainings/${t.id}/participants/${a.id}`).set(hr())).status, 200);
    assert.equal((await enrol(t.id, c.id)).status, 201);
  });

  it('never overbooks under concurrent enrolments', async () => {
    const t = await createTraining(ctx, { capacity: 3 });
    const people = [];
    for (let i = 0; i < 8; i += 1) people.push(await createEmployee(ctx));
    const results = await Promise.all(people.map((p) => enrol(t.id, p.id)));
    const ok = results.filter((r) => r.status === 201).length;
    const full = results.filter((r) => r.status === 409 && r.body.error.code === 'CAPACITY_FULL').length;
    assert.equal(ok, 3);
    assert.equal(full, 5);
    const detail = await ctx.request.get(`/api/trainings/${t.id}`).set(hr());
    assert.equal(detail.body.enrolledCount, 3);
  });

  it('does not accept the same employee twice under concurrency', async () => {
    const t = await createTraining(ctx, { capacity: 10 });
    const e = await createEmployee(ctx);
    const results = await Promise.all([1, 2, 3, 4].map(() => enrol(t.id, e.id)));
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.equal(results.filter((r) => r.status === 409).length, 3);
  });

  it('rejects inactive employees, unknown ids and bad payloads', async () => {
    const t = await createTraining(ctx);
    const inactive = await createEmployee(ctx, { status: 'inactive' });
    const res = await enrol(t.id, inactive.id);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'EMPLOYEE_INACTIVE');

    assert.equal((await enrol(t.id, 999999)).status, 404);
    assert.equal((await enrol(999999, inactive.id)).status, 404);
    const bad = await ctx.request.post(`/api/trainings/${t.id}/participants`).set(hr()).send({ employeeId: 'abc' });
    assert.equal(bad.status, 422);
    const missing = await ctx.request.post(`/api/trainings/${t.id}/participants`).set(hr()).send({});
    assert.equal(missing.status, 422);
  });

  it('closes enrolment once a training is completed or cancelled', async () => {
    const e = await createEmployee(ctx);
    const done = await createTraining(ctx);
    await setStatus(ctx, done.id, 'in_progress');
    assert.equal((await enrol(done.id, e.id)).status, 201, 'in-progress trainings still accept late enrolments');
    await setStatus(ctx, done.id, 'completed');
    const late = await enrol(done.id, (await createEmployee(ctx)).id);
    assert.equal(late.status, 409);
    assert.equal(late.body.error.code, 'TRAINING_CLOSED');

    const cancelled = await createTraining(ctx);
    await setStatus(ctx, cancelled.id, 'cancelled');
    assert.equal((await enrol(cancelled.id, e.id)).status, 409);
  });

  describe('attendance & completion', () => {
    it('is only possible once the training has started', async () => {
      const t = await createTraining(ctx);
      const e = await createEmployee(ctx);
      await enrol(t.id, e.id);
      const early = await ctx.request.patch(`/api/trainings/${t.id}/participants/${e.id}`).set(hr()).send({ status: 'attended' });
      assert.equal(early.status, 409);
      assert.equal(early.body.error.code, 'ATTENDANCE_NOT_ALLOWED');
    });

    it('marks attended / completed / absent and summarises them', async () => {
      const t = await createTraining(ctx, { capacity: 5 });
      const people = [await createEmployee(ctx), await createEmployee(ctx), await createEmployee(ctx)];
      for (const p of people) await enrol(t.id, p.id);
      await setStatus(ctx, t.id, 'in_progress');

      const patch = (p, status) => ctx.request.patch(`/api/trainings/${t.id}/participants/${p.id}`).set(hr()).send({ status });
      assert.equal((await patch(people[0], 'attended')).status, 200);
      assert.equal((await patch(people[1], 'absent')).status, 200);
      await setStatus(ctx, t.id, 'completed');
      const last = await patch(people[0], 'completed');
      assert.equal(last.status, 200);
      assert.deepEqual(last.body.summary, { enrolled: 1, attended: 0, completed: 1, absent: 1 });

      const invalid = await patch(people[2], 'sleeping');
      assert.equal(invalid.status, 422);
      const unknown = await ctx.request.patch(`/api/trainings/${t.id}/participants/999999`).set(hr()).send({ status: 'attended' });
      assert.equal(unknown.status, 404);
    });

    it('does not allow removing participants after the training finished', async () => {
      const t = await createTraining(ctx);
      const e = await createEmployee(ctx);
      await enrol(t.id, e.id);
      await setStatus(ctx, t.id, 'in_progress');
      await setStatus(ctx, t.id, 'completed');
      const res = await ctx.request.delete(`/api/trainings/${t.id}/participants/${e.id}`).set(hr());
      assert.equal(res.status, 409);
    });
  });

  it('dashboard aggregates KPIs, departments, upcoming trainings and budget by month', async () => {
    const res = await ctx.request.get('/api/dashboard').set(hr());
    assert.equal(res.status, 200);
    const d = res.body;
    assert.ok(d.kpis.activeEmployees > 0);
    assert.ok(d.kpis.totalEmployees >= d.kpis.activeEmployees);
    assert.ok(d.kpis.upcomingTrainings > 0);
    assert.ok(d.kpis.totalEnrollments > 0);
    assert.equal(typeof d.kpis.budgetThisYear, 'number');
    assert.ok(d.kpis.completionRate >= 0 && d.kpis.completionRate <= 100);
    assert.ok(d.departmentDistribution.some((x) => x.department === 'Engineering'));
    assert.equal(d.budgetByMonth.length, 12);
    assert.ok(d.budgetByMonth.every((m) => /^\d{4}-\d{2}$/.test(m.month)));
    assert.ok(d.budgetByMonth.some((m) => m.budget > 0));
    assert.ok(d.upcomingTrainings.length > 0 && d.upcomingTrainings.length <= 6);
    assert.ok(d.upcomingTrainings.every((t) => ['planned', 'in_progress'].includes(t.status)));
    assert.ok(d.trainingsByStatus.some((s) => s.status === 'planned'));
  });

  it('records write operations in the audit log (admin only)', async () => {
    const t = await createTraining(ctx, { title: 'Audited training' });
    const e = await createEmployee(ctx, { fullName: 'Audited Person' });
    await enrol(t.id, e.id);
    await setStatus(ctx, t.id, 'cancelled');

    const res = await ctx.request.get('/api/audit-log?pageSize=100').set(bearer(ctx.tokens.admin));
    assert.equal(res.status, 200);
    const actions = res.body.data.map((a) => a.action);
    for (const expected of ['training.create', 'employee.create', 'participant.add', 'training.status', 'auth.login']) {
      assert.ok(actions.includes(expected), `missing ${expected}`);
    }
    const entry = res.body.data.find((a) => a.action === 'participant.add' && a.details.includes('Audited training'));
    assert.equal(entry.username, 'hr');

    const filtered = await ctx.request.get('/api/audit-log?entity=employee&search=Audited').set(bearer(ctx.tokens.admin));
    assert.ok(filtered.body.data.length >= 1);
    assert.ok(filtered.body.data.every((a) => a.entity === 'employee'));
    assert.equal(res.body.data[0].id > res.body.data[1].id, true, 'newest first');
  });

  it('logs failed sign-ins without storing the password', async () => {
    await ctx.request.post('/api/auth/login').send({ username: 'admin', password: 'definitely-wrong-password' });
    const res = await ctx.request.get('/api/audit-log?search=login_failed').set(bearer(ctx.tokens.admin));
    assert.ok(res.body.data.length >= 1);
    assert.equal(JSON.stringify(res.body).includes('definitely-wrong-password'), false);
  });
});
