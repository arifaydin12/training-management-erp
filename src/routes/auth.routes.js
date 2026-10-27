'use strict';

const { Router } = require('express');
const schemas = require('../validation/schemas');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rate-limit');
const authService = require('../services/auth.service');
const usersService = require('../services/users.service');

function authRoutes(config, { loginRateLimit } = {}) {
  const router = Router();

  router.post(
    '/login',
    loginLimiter(loginRateLimit || config.loginRateLimit),
    validate({ body: schemas.login }),
    async (req, res) => {
      res.json(await authService.login(config, req.valid.body));
    },
  );

  router.get('/me', authenticate(config), async (req, res) => {
    res.json({ user: await usersService.getById(req.user.id) });
  });

  return router;
}

module.exports = authRoutes;
