'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestApp, stopTestApp, bearer, employeePayload, createEmployee, createTraining, setStatus } = require('../test-support/helpers');

describe('employees API', () => {
  let ctx;
  const hr = () => bearer(ctx.tokens.hr);
  before(async () => {
    ctx = await startTestApp('employees');
  });
  after(stopTestApp);

  it('creates an employee with an auto-generated employee number', async () => {
    const res = await ctx.request.post('/api/employees').set(hr()).send(employeePayload({ fullName: '  Anna Kowalska  ', email: 'Anna.Kowalska@Example.com' }));
    assert.equal(res.status, 201);
    assert.equal(res.body.fullName, 'Anna Kowalska');
    assert.equal(res.body.email, 'anna.kowalska@example.com');
    assert.match(res.body.employeeNumber, /^EMP-\d{4}$/);
    assert.equal(res.body.status, 'active');
    assert.equal(res.body.hireDate, '2022-03-01');
    assert.equal(res.body.trainingCount, 0);
  });

  it('reads, updates and deletes an employee', async () => {
    const e = await createEmployee(ctx);
    const got = await ctx.request.get(`/api/employees/${e.id}`).set(hr());
    assert.equal(got.status, 200);
    assert.deepEqual(got.body.trainings, []);

    const put = await ctx.request
      .put(`/api/employees/${e.id}`)
      .set(hr())
      .send(employeePayload({ fullName: 'Renamed Person', email: e.email, department: 'Finance', status: 'inactive' }));
    assert.equal(put.status, 200);
    assert.equal(put.body.fullName, 'Renamed Person');
    assert.equal(put.body.department, 'Finance');
    assert.equal(put.body.status, 'inactive');
    assert.equal(put.body.employeeNumber, e.employeeNumber);

    const del = await ctx.request.delete(`/api/employees/${e.id}`).set(bearer(ctx.tokens.admin));
    assert.equal(del.status, 204);
    assert.equal((await ctx.request.get(`/api/employees/${e.id}`).set(hr())).status, 404);
  });

  it('returns field-level validation errors', async () => {
    const res = await ctx.request
      .post('/api/employees')
      .set(hr())
      .send({ fullName: '', email: 'not-an-email', department: 'Pirates', jobTitle: 'x', hireDate: '2022-02-31', status: 'sleeping' });
    assert.equal(res.status, 422);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    const fields = res.body.error.details.map((d) => d.field).sort();
    assert.deepEqual(fields, ['department', 'email', 'fullName', 'hireDate', 'status']);
    for (const d of res.body.error.details) assert.ok(d.message.length > 3);
  });

  it('rejects unknown ids and malformed ids', async () => {
    assert.equal((await ctx.request.get('/api/employees/999999').set(hr())).status, 404);
    const bad = await ctx.request.get('/api/employees/abc').set(hr());
    assert.equal(bad.status, 422);
    assert.equal((await ctx.request.put('/api/employees/999999').set(hr()).send(employeePayload())).status, 404);
  });

  it('refuses duplicate emails and employee numbers with 409', async () => {
    const a = await createEmployee(ctx, { employeeNumber: 'DUP-0001' });
    const sameEmail = await ctx.request.post('/api/employees').set(hr()).send(employeePayload({ email: a.email }));
    assert.equal(sameEmail.status, 409);
    assert.match(sameEmail.body.error.message, /email/i);
    const sameNumber = await ctx.request.post('/api/employees').set(hr()).send(employeePayload({ employeeNumber: 'DUP-0001' }));
    assert.equal(sameNumber.status, 409);
  });

  describe('listing', () => {
    before(async () => {
      for (let i = 1; i <= 12; i += 1) {
        await createEmployee(ctx, {
          fullName: `Lister Person ${String(i).padStart(2, '0')}`,
          department: i % 2 ? 'Sales' : 'Legal',
          status: i === 12 ? 'inactive' : 'active',
          jobTitle: i === 3 ? 'Percent 100% Hero_1' : 'Account Executive',
        });
      }
    });

    it('paginates and reports metadata', async () => {
      const res = await ctx.request.get('/api/employees?search=Lister&page=2&pageSize=5&sort=fullName').set(hr());
      assert.equal(res.status, 200);
      assert.equal(res.body.meta.total, 12);
      assert.equal(res.body.meta.totalPages, 3);
      assert.equal(res.body.meta.page, 2);
      assert.equal(res.body.data.length, 5);
      assert.equal(res.body.data[0].fullName, 'Lister Person 06');
    });

    it('filters by department and status, and sorts descending', async () => {
      const sales = await ctx.request.get('/api/employees?search=Lister&department=Sales').set(hr());
      assert.equal(sales.body.meta.total, 6);
      assert.ok(sales.body.data.every((e) => e.department === 'Sales'));

      const inactive = await ctx.request.get('/api/employees?search=Lister&status=inactive').set(hr());
      assert.equal(inactive.body.meta.total, 1);

      const desc = await ctx.request.get('/api/employees?search=Lister&sort=fullName&order=desc&pageSize=3').set(hr());
      assert.equal(desc.body.data[0].fullName, 'Lister Person 12');
    });

    it('searches case-insensitively and treats LIKE wildcards literally', async () => {
      const ci = await ctx.request.get('/api/employees?search=lister%20person%2007').set(hr());
      assert.equal(ci.body.meta.total, 1);

      const percent = await ctx.request.get('/api/employees?search=' + encodeURIComponent('100%')).set(hr());
      assert.equal(percent.body.meta.total, 1);
      const lone = await ctx.request.get('/api/employees?search=' + encodeURIComponent('%')).set(hr());
      assert.equal(lone.body.meta.total, 1);
    });

    it('is not vulnerable to SQL injection through filters', async () => {
      const payload = encodeURIComponent("x'; DROP TABLE dbo.employees; --");
      const res = await ctx.request.get(`/api/employees?search=${payload}`).set(hr());
      assert.equal(res.status, 200);
      assert.equal(res.body.meta.total, 0);
      const still = await ctx.request.get('/api/employees?search=Lister').set(hr());
      assert.equal(still.body.meta.total, 12);

      const sortInjection = await ctx.request.get('/api/employees?sort=' + encodeURIComponent('id; DROP TABLE dbo.employees')).set(hr());
      assert.equal(sortInjection.status, 422);
    });

    it('validates query parameters', async () => {
      assert.equal((await ctx.request.get('/api/employees?page=0').set(hr())).status, 422);
      assert.equal((await ctx.request.get('/api/employees?pageSize=1000').set(hr())).status, 422);
      assert.equal((await ctx.request.get('/api/employees?department=Pirates').set(hr())).status, 422);
    });

    it('exports the filtered list as CSV', async () => {
      const res = await ctx.request.get('/api/employees/export.csv?search=Lister&department=Legal').set(hr());
      assert.equal(res.status, 200);
      assert.match(res.headers['content-type'], /text\/csv/);
      assert.match(res.headers['content-disposition'], /attachment; filename="employees-\d{4}-\d{2}-\d{2}\.csv"/);
      const lines = res.text.replace(/^\uFEFF/, '').trim().split('\r\n');
      assert.equal(lines[0], 'Employee number,Full name,Email,Department,Job title,Hire date,Status,Trainings');
      assert.equal(lines.length, 1 + 6);
      assert.ok(lines.slice(1).every((l) => l.includes(',Legal,')));
    });

    it('neutralises spreadsheet formulas in CSV cells', async () => {
      await createEmployee(ctx, { fullName: 'Formula Victim', jobTitle: '=HYPERLINK("http://x")' });
      const res = await ctx.request.get('/api/employees/export.csv?search=Formula').set(hr());
      assert.match(res.text, /"'=HYPERLINK\(""http:\/\/x""\)"/);
    });
  });

  it('shows an employee’s trainings in the per-employee view', async () => {
    const e = await createEmployee(ctx);
    const t = await createTraining(ctx, { title: 'Per-employee view training' });
    await setStatus(ctx, t.id, 'in_progress');
    await ctx.request.post(`/api/trainings/${t.id}/participants`).set(hr()).send({ employeeId: e.id });
    await ctx.request.patch(`/api/trainings/${t.id}/participants/${e.id}`).set(hr()).send({ status: 'attended' });

    const res = await ctx.request.get(`/api/employees/${e.id}`).set(hr());
    assert.equal(res.body.trainingCount, 1);
    assert.equal(res.body.trainings.length, 1);
    assert.equal(res.body.trainings[0].title, 'Per-employee view training');
    assert.equal(res.body.trainings[0].participationStatus, 'attended');
    assert.equal(res.body.trainings[0].trainingStatus, 'in_progress');
  });

  it('removes enrolments together with the employee (cascade)', async () => {
    const e = await createEmployee(ctx);
    const t = await createTraining(ctx);
    await ctx.request.post(`/api/trainings/${t.id}/participants`).set(hr()).send({ employeeId: e.id });
    await ctx.request.delete(`/api/employees/${e.id}`).set(bearer(ctx.tokens.admin));
    const after = await ctx.request.get(`/api/trainings/${t.id}`).set(hr());
    assert.equal(after.body.enrolledCount, 0);
  });
});
