'use strict';

const { Router } = require('express');
const schemas = require('../validation/schemas');
const { validate } = require('../middleware/validate');
const { authorize } = require('../middleware/auth');
const constants = require('../constants');
const dashboard = require('../services/dashboard.service');
const audit = require('../services/audit.service');
const users = require('../services/users.service');
const { paginated } = require('../utils/pagination');

function miscRoutes(config) {
  const router = Router();

  router.get('/dashboard', async (_req, res) => {
    res.json(await dashboard.getDashboard());
  });

  // Reference data used by the front end for filters and forms.
  router.get('/meta', (_req, res) => {
    res.json({
      roles: constants.ROLES,
      departments: constants.DEPARTMENTS,
      categories: constants.TRAINING_CATEGORIES,
      employeeStatuses: constants.EMPLOYEE_STATUSES,
      trainingStatuses: constants.TRAINING_STATUSES,
      participantStatuses: constants.PARTICIPANT_STATUSES,
      trainingTransitions: constants.TRAINING_TRANSITIONS,
    });
  });

  router.get('/audit-log', authorize('admin'), validate({ query: schemas.auditQuery }), async (req, res) => {
    const q = req.valid.query;
    const { data, total } = await audit.list(q);
    res.json(paginated(data, q, total));
  });

  router.get('/users', authorize('admin'), async (_req, res) => {
    res.json({ data: await users.list() });
  });

  router.post('/users', authorize('admin'), validate({ body: schemas.createUser }), async (req, res) => {
    const created = await users.create(req.valid.body, { actor: req.user, rounds: config.bcryptRounds });
    res.status(201).json(created);
  });

  return router;
}

module.exports = miscRoutes;
