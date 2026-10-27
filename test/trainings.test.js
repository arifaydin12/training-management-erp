'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp, stopTestApp, bearer, trainingPayload, createEmployee, createTraining, setStatus, day } = require('../test-support/helpers');

describe('trainings API', () => {
  let ctx;
  const hr = () => bearer(ctx.tokens.hr);
  before(async () => {
    ctx = await startTestApp('trainings');
  });
  after(stopTestApp);

  it('creates a planned training and returns the full record', async () => {
    const payload = trainingPayload({ title: '  Secure Coding  ', budget: 1234.5 });
    const res = await ctx.request.post('/api/trainings').set(hr()).send(payload);
    assert.equal(res.status, 201);
    assert.equal(res.body.title, 'Secure Coding');
    assert.equal(res.body.status, 'planned');
    assert.equal(res.body.budget, 1234.5);
    assert.equal(res.body.capacity, 5);
    assert.equal(res.body.enrolledCount, 0);
    assert.equal(res.body.startDate, payload.startDate);
  });

  it('cannot create a training directly in a non-planned status', async () => {
    const res = await ctx.request.post('/api/trainings').set(hr()).send(trainingPayload({ status: 'completed' }));
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'planned');
  });

  it('validates the training payload', async () => {
    const res = await ctx.request
      .post('/api/trainings')
      .set(hr())
      .send({ title: '', category: 'Cooking', trainer: '', startDate: 'tomorrow', endDate: day(1), capacity: 0, budget: -5 });
    assert.equal(res.status, 422);
    const fields = res.body.error.details.map((d) => d.field).sort();
    assert.deepEqual(fields, ['budget', 'capacity', 'category', 'startDate', 'title', 'trainer']);

    const order = await ctx.request.post('/api/trainings').set(hr()).send(trainingPayload({ startDate: day(5), endDate: day(2) }));
    assert.equal(order.status, 422);
    assert.equal(order.body.error.details[0].field, 'endDate');

    const type = await ctx.request.post('/api/trainings').set(hr()).send(trainingPayload({ capacity: '10' }));
    assert.equal(type.status, 422);
    assert.equal(type.body.error.details[0].field, 'capacity');
  });

  it('updates a planned training', async () => {
    const t = await createTraining(ctx);
    const res = await ctx.request
      .put(`/api/trainings/${t.id}`)
      .set(hr())
      .send(trainingPayload({ title: 'Updated title', capacity: 9, category: 'Leadership' }));
    assert.equal(res.status, 200);
    assert.equal(res.body.title, 'Updated title');
    assert.equal(res.body.capacity, 9);
    assert.equal(res.body.category, 'Leadership');
    assert.equal((await ctx.request.put('/api/trainings/999999').set(hr()).send(trainingPayload())).status, 404);
  });

  it('refuses to lower the capacity below the number of enrolled people', async () => {
    const t = await createTraining(ctx, { capacity: 4 });
    for (let i = 0; i < 3; i += 1) {
      const e = await createEmployee(ctx);
      await ctx.request.post(`/api/trainings/${t.id}/participants`).set(hr()).send({ employeeId: e.id });
    }
    const res = await ctx.request.put(`/api/trainings/${t.id}`).set(hr()).send(trainingPayload({ capacity: 2 }));
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'CAPACITY_TOO_LOW');
  });

  describe('status workflow', () => {
    it('follows planned -> in_progress -> completed', async () => {
      const t = await createTraining(ctx);
      assert.equal((await setStatus(ctx, t.id, 'in_progress')).status, 'in_progress');
      assert.equal((await setStatus(ctx, t.id, 'completed')).status, 'completed');
    });

    it('allows cancelling from planned and in_progress', async () => {
      const a = await createTraining(ctx);
      assert.equal((await setStatus(ctx, a.id, 'cancelled')).status, 'cancelled');
      const b = await createTraining(ctx);
      await setStatus(ctx, b.id, 'in_progress');
      assert.equal((await setStatus(ctx, b.id, 'cancelled')).status, 'cancelled');
    });

    it('rejects invalid transitions with 409', async () => {
      const t = await createTraining(ctx);
      const skip = await ctx.request.post(`/api/trainings/${t.id}/status`).set(hr()).send({ status: 'completed' });
      assert.equal(skip.status, 409);
      assert.equal(skip.body.error.code, 'INVALID_TRANSITION');

      await setStatus(ctx, t.id, 'cancelled');
      const revive = await ctx.request.post(`/api/trainings/${t.id}/status`).set(hr()).send({ status: 'planned' });
      assert.equal(revive.status, 409);
      const same = await ctx.request.post(`/api/trainings/${t.id}/status`).set(hr()).send({ status: 'cancelled' });
      assert.equal(same.status, 409);
    });

    it('validates the status value', async () => {
      const t = await createTraining(ctx);
      const res = await ctx.request.post(`/api/trainings/${t.id}/status`).set(hr()).send({ status: 'finished' });
      assert.equal(res.status, 422);
    });

    it('locks completed and cancelled trainings against edits', async () => {
      const t = await createTraining(ctx);
      await setStatus(ctx, t.id, 'cancelled');
      const res = await ctx.request.put(`/api/trainings/${t.id}`).set(hr()).send(trainingPayload());
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'TRAINING_LOCKED');
    });
  });

  describe('listing', () => {
    before(async () => {
      const cats = ['Technical', 'Leadership', 'Safety'];
      for (let i = 0; i < 7; i += 1) {
        const t = await createTraining(ctx, {
          title: `Catalog item ${i}`,
          category: cats[i % 3],
          trainer: i === 0 ? 'Zed Unique Trainer' : 'Regular Trainer',
          startDate: day(20 + i),
          endDate: day(20 + i),
          budget: 100 * (i + 1),
        });
        if (i === 6) await setStatus(ctx, t.id, 'cancelled');
      }
    });

    it('paginates, filters and sorts', async () => {
      const page = await ctx.request.get('/api/trainings?search=Catalog&pageSize=3&page=3&sort=startDate&order=asc').set(hr());
      assert.equal(page.body.meta.total, 7);
      assert.equal(page.body.meta.totalPages, 3);
      assert.equal(page.body.data.length, 1);
      assert.equal(page.body.data[0].title, 'Catalog item 6');

      const cancelled = await ctx.request.get('/api/trainings?search=Catalog&status=cancelled').set(hr());
      assert.equal(cancelled.body.meta.total, 1);

      const tech = await ctx.request.get('/api/trainings?search=Catalog&category=Technical').set(hr());
      assert.equal(tech.body.meta.total, 3);

      const byTrainer = await ctx.request.get('/api/trainings?search=unique%20trainer').set(hr());
      assert.equal(byTrainer.body.meta.total, 1);

      const byBudget = await ctx.request.get('/api/trainings?search=Catalog&sort=budget&order=desc&pageSize=1').set(hr());
      assert.equal(byBudget.body.data[0].budget, 700);
    });

    it('rejects unknown filter values', async () => {
      assert.equal((await ctx.request.get('/api/trainings?status=bogus').set(hr())).status, 422);
      assert.equal((await ctx.request.get('/api/trainings?category=bogus').set(hr())).status, 422);
      assert.equal((await ctx.request.get('/api/trainings?sort=bogus').set(hr())).status, 422);
    });
  });

  it('returns 404 for unknown trainings and deletes with cascade', async () => {
    assert.equal((await ctx.request.get('/api/trainings/999999').set(hr())).status, 404);
    const t = await createTraining(ctx);
    const e = await createEmployee(ctx);
    await ctx.request.post(`/api/trainings/${t.id}/participants`).set(hr()).send({ employeeId: e.id });
    const del = await ctx.request.delete(`/api/trainings/${t.id}`).set(bearer(ctx.tokens.admin));
    assert.equal(del.status, 204);
    assert.equal((await ctx.request.get(`/api/trainings/${t.id}`).set(hr())).status, 404);
    const emp = await ctx.request.get(`/api/employees/${e.id}`).set(hr());
    assert.equal(emp.body.trainings.length, 0);
  });

  it('exposes reference data for forms', async () => {
    const res = await ctx.request.get('/api/meta').set(hr());
    assert.equal(res.status, 200);
    assert.ok(res.body.categories.includes('Technical'));
    assert.deepEqual(res.body.trainingTransitions.planned, ['in_progress', 'cancelled']);
  });
});
