'use strict';

const { Router } = require('express');
const schemas = require('../validation/schemas');
const { validate } = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const employees = require('../services/employees.service');
const { toCsv } = require('../utils/csv');
const { paginated } = require('../utils/pagination');

const WRITE = ['admin', 'hr_manager'];
const ADMIN = ['admin'];

const router = Router();

router.get('/', validate({ query: schemas.employeeQuery }), async (req, res) => {
  const q = req.valid.query;
  const { data, total } = await employees.list(q);
  res.json(paginated(data, q, total));
});

// Declared before "/:id" so that "export.csv" is not treated as an id.
router.get('/export.csv', validate({ query: schemas.employeeExportQuery }), async (req, res) => {
  const rows = await employees.listAll(req.valid.query);
  const csv = toCsv(
    [
      { header: 'Employee number', value: (r) => r.employeeNumber },
      { header: 'Full name', value: (r) => r.fullName },
      { header: 'Email', value: (r) => r.email },
      { header: 'Department', value: (r) => r.department },
      { header: 'Job title', value: (r) => r.jobTitle },
      { header: 'Hire date', value: (r) => r.hireDate },
      { header: 'Status', value: (r) => r.status },
      { header: 'Trainings', value: (r) => r.trainingCount },
    ],
    rows,
  );
  const stamp = new Date().toISOString().slice(0, 10);
  res
    .type('text/csv; charset=utf-8')
    .set('Content-Disposition', `attachment; filename="employees-${stamp}.csv"`)
    .send(csv);
});

router.get('/:id', validate({ params: schemas.params.id }), async (req, res) => {
  res.json(await employees.getDetail(req.valid.params.id));
});

router.post('/', authorize(...WRITE), validate({ body: schemas.employeeBody }), async (req, res) => {
  res.status(201).json(await employees.create(req.valid.body, req.user));
});

router.put(
  '/:id',
  authorize(...WRITE),
  validate({ params: schemas.params.id, body: schemas.employeeBody }),
  async (req, res) => {
    res.json(await employees.update(req.valid.params.id, req.valid.body, req.user));
  },
);

router.delete('/:id', authorize(...ADMIN), validate({ params: schemas.params.id }), async (req, res) => {
  await employees.remove(req.valid.params.id, req.user);
  res.status(204).end();
});

module.exports = router;
