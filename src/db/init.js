'use strict';

const fs = require('node:fs');
const path = require('node:path');
const sql = require('mssql');
const { loadConfig } = require('../config');
const db = require('./pool');

const SCHEMA_FILE = path.join(__dirname, '..', '..', 'database', 'schema.sql');

function assertSafeName(name) {
  // Database names cannot be bound as parameters, so they are strictly validated instead.
  if (!/^[A-Za-z0-9_]{1,100}$/.test(name)) {
    throw new Error(`Invalid database name "${name}": use letters, digits and underscores only`);
  }
  return name;
}

async function withMaster(fn) {
  const { db: cfg } = loadConfig();
  const master = new sql.ConnectionPool({
    server: cfg.server,
    port: cfg.port,
    database: 'master',
    user: cfg.user,
    password: cfg.password,
    options: { encrypt: cfg.encrypt, trustServerCertificate: cfg.trustServerCertificate },
  });
  await master.connect();
  try {
    return await fn(master);
  } finally {
    await master.close();
  }
}

async function createDatabaseIfMissing(name = loadConfig().db.database) {
  assertSafeName(name);
  await withMaster((master) => master.request().batch(`IF DB_ID(N'${name}') IS NULL CREATE DATABASE [${name}]`));
}

async function dropDatabase(name = loadConfig().db.database) {
  assertSafeName(name);
  await db.close();
  await withMaster((master) =>
    master
      .request()
      .batch(
        `IF DB_ID(N'${name}') IS NOT NULL BEGIN ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${name}]; END`,
      ),
  );
}

/** Splits a script on lines that contain only GO. */
function splitBatches(script) {
  return script
    .split(/^\s*GO\s*$/im)
    .map((b) => b.trim())
    .filter(Boolean);
}

async function applySchema() {
  const pool = await db.getPool();
  const script = fs.readFileSync(SCHEMA_FILE, 'utf8');
  for (const batch of splitBatches(script)) {
    await pool.request().batch(batch);
  }
}

async function initDatabase() {
  await createDatabaseIfMissing();
  await applySchema();
}

module.exports = { createDatabaseIfMissing, dropDatabase, applySchema, initDatabase, splitBatches };
