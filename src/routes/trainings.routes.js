'use strict';

const { Router } = require('express');
const schemas = require('../validation/schemas');
const { validate } = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const trainings = require('../services/trainings.service');
const { paginated } = require('../utils/pagination');

const WRITE = ['admin', 'hr_manager'];
const ADMIN = ['admin'];

const router = Router();

router.get('/', validate({ query: schemas.trainingQuery }), async (req, res) => {
  const q = req.valid.query;
  const { data, total } = await trainings.list(q);
  res.json(paginated(data, q, total));
});

router.get('/:id', validate({ params: schemas.params.id }), async (req, res) => {
  res.json(await trainings.getDetail(req.valid.params.id));
});

router.post('/', authorize(...WRITE), validate({ body: schemas.trainingBody }), async (req, res) => {
  res.status(201).json(await trainings.create(req.valid.body, req.user));
});

router.put(
  '/:id',
  authorize(...WRITE),
  validate({ params: schemas.params.id, body: schemas.trainingBody }),
  async (req, res) => {
    res.json(await trainings.update(req.valid.params.id, req.valid.body, req.user));
  },
);

router.delete('/:id', authorize(...ADMIN), validate({ params: schemas.params.id }), async (req, res) => {
  await trainings.remove(req.valid.params.id, req.user);
  res.status(204).end();
});

router.post(
  '/:id/status',
  authorize(...WRITE),
  validate({ params: schemas.params.id, body: schemas.trainingStatus }),
  async (req, res) => {
    res.json(await trainings.changeStatus(req.valid.params.id, req.valid.body.status, req.user));
  },
);

// ---- participants -------------------------------------------------------

router.get('/:id/participants', validate({ params: schemas.params.id }), async (req, res) => {
  await trainings.getById(req.valid.params.id); // 404 for unknown trainings
  res.json({ data: await trainings.listParticipants(req.valid.params.id) });
});

router.post(
  '/:id/participants',
  authorize(...WRITE),
  validate({ params: schemas.params.id, body: schemas.addParticipant }),
  async (req, res) => {
    const detail = await trainings.addParticipant(req.valid.params.id, req.valid.body.employeeId, req.user);
    res.status(201).json(detail);
  },
);

router.patch(
  '/:id/participants/:employeeId',
  authorize(...WRITE),
  validate({ params: schemas.params.trainingEmployee, body: schemas.participantStatus }),
  async (req, res) => {
    const { id, employeeId } = req.valid.params;
    res.json(await trainings.setParticipantStatus(id, employeeId, req.valid.body.status, req.user));
  },
);

router.delete(
  '/:id/participants/:employeeId',
  authorize(...WRITE),
  validate({ params: schemas.params.trainingEmployee }),
  async (req, res) => {
    const { id, employeeId } = req.valid.params;
    res.json(await trainings.removeParticipant(id, employeeId, req.user));
  },
);

module.exports = router;
