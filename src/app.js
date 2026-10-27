'use strict';

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const db = require('./db/pool');
const { authenticate } = require('./middleware/auth');
const { apiLimiter } = require('./middleware/rate-limit');
const { errorHandler, notFoundHandler } = require('./middleware/error-handler');
const authRoutes = require('./routes/auth.routes');
const employeeRoutes = require('./routes/employees.routes');
const trainingRoutes = require('./routes/trainings.routes');
const miscRoutes = require('./routes/misc.routes');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/**
 * Builds the Express application. Nothing is started here (no listen, no DB
 * connection), which keeps the app easy to test.
 */
function createApp(config, options = {}) {
  const app = express();

  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'script-src': ["'self'"],
          'img-src': ["'self'", 'data:'],
          'upgrade-insecure-requests': null,
        },
      },
    }),
  );

  if (config.corsOrigins.length) {
    const allowAll = config.corsOrigins.includes('*');
    app.use(
      cors({
        origin: allowAll ? true : config.corsOrigins,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allowedHeaders: ['Authorization', 'Content-Type'],
        maxAge: 600,
      }),
    );
  }

  if (config.logRequests) {
    app.use(
      morgan(config.isProduction ? 'combined' : 'dev', {
        skip: (req) => req.path === '/api/health',
      }),
    );
  }

  app.use(express.json({ limit: '100kb' }));

  // ---- API ---------------------------------------------------------------
  const api = express.Router();
  if (!config.isTest || options.apiRateLimit) api.use(apiLimiter(options.apiRateLimit));

  api.get('/health', async (_req, res) => {
    try {
      await db.ping();
      res.json({ status: 'ok', database: 'up', uptimeSeconds: Math.round(process.uptime()) });
    } catch (_err) {
      res.status(503).json({ status: 'degraded', database: 'down', uptimeSeconds: Math.round(process.uptime()) });
    }
  });

  api.use('/auth', authRoutes(config, { loginRateLimit: options.loginRateLimit }));

  // Everything below requires a valid access token.
  api.use(authenticate(config));
  api.use('/employees', employeeRoutes);
  api.use('/trainings', trainingRoutes);
  api.use('/', miscRoutes(config));
  api.use(notFoundHandler);

  app.use('/api', api);

  // ---- Front end ---------------------------------------------------------
  app.use(express.static(PUBLIC_DIR, { index: 'index.html', maxAge: config.isProduction ? '1h' : 0 }));
  app.use(notFoundHandler);

  app.use(errorHandler());
  return app;
}

module.exports = { createApp };
