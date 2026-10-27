// Creates the database named by DB_NAME (if missing) and applies database/schema.sql.
// Safe to run repeatedly. Usage: npm run db:init
'use strict';

const { loadConfig } = require('../src/config');
const { initDatabase } = require('../src/db/init');
const db = require('../src/db/pool');

(async () => {
  const { db: cfg } = loadConfig();
  await initDatabase();
  console.log(`Database "${cfg.database}" is ready on ${cfg.server}:${cfg.port}.`);
  console.log('Next: npm run seed (demo data) or npm run create-admin -- <username> "<Full Name>" "<password>"');
})()
  .catch((err) => {
    console.error(`db:init failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.close());
