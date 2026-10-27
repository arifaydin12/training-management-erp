'use strict';

const { loadConfig } = require('./src/config');
const { createApp } = require('./src/app');
const db = require('./src/db/pool');

const config = loadConfig();
const app = createApp(config);

const server = app.listen(config.port, () => {
  console.log(`Training Management ERP listening on http://localhost:${config.port}`);
  if (config.jwt.ephemeral) {
    console.warn('[config] JWT_SECRET is not set: using a random secret, sessions end when the server restarts.');
  }
  // Connect eagerly so configuration problems show up at startup, not on the first request.
  db.getPool()
    .then(() => console.log(`[db] connected to ${config.db.server}:${config.db.port}/${config.db.database}`))
    .catch((err) => console.error(`[db] connection failed: ${err.message} (check the DB_* settings in .env)`));
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received, shutting down...`);

  const force = setTimeout(() => {
    console.error('Forced exit after timeout');
    process.exit(1);
  }, 10000);
  force.unref();

  server.close(async () => {
    try {
      await db.close();
    } finally {
      process.exit(0);
    }
  });
  server.closeIdleConnections?.();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));
