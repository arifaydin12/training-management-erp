'use strict';

const sql = require('mssql');
const { loadConfig } = require('../config');

let pool = null;
let poolPromise = null;

function buildSqlConfig() {
  const { db } = loadConfig();
  return {
    server: db.server,
    port: db.port,
    database: db.database,
    user: db.user,
    password: db.password,
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    options: {
      encrypt: db.encrypt,
      trustServerCertificate: db.trustServerCertificate,
      enableArithAbort: true,
    },
  };
}

/** Lazily creates the shared connection pool. A failed attempt is not cached. */
function getPool() {
  if (!poolPromise) {
    const next = new sql.ConnectionPool(buildSqlConfig());
    next.on('error', (err) => console.error('[db] pool error:', err.message));
    poolPromise = next
      .connect()
      .then((connected) => {
        pool = connected;
        return connected;
      })
      .catch((err) => {
        poolPromise = null;
        throw err;
      });
  }
  return poolPromise;
}

function bind(request, params) {
  for (const [name, value] of Object.entries(params)) {
    request.input(name, value === undefined ? null : value);
  }
  return request;
}

/**
 * Runs a parameterised statement. All user input must be passed through `params`;
 * values are never concatenated into the SQL text.
 */
async function query(text, params = {}) {
  const p = await getPool();
  return bind(p.request(), params).query(text);
}

/** Runs `fn(run)` inside a transaction; `run` has the same signature as `query`. */
async function transaction(fn) {
  const p = await getPool();
  const tx = new sql.Transaction(p);
  await tx.begin();
  const run = (text, params = {}) => bind(tx.request(), params).query(text);
  try {
    const result = await fn(run);
    await tx.commit();
    return result;
  } catch (err) {
    try {
      await tx.rollback();
    } catch (_) {
      /* the transaction may already have been aborted by the server */
    }
    throw err;
  }
}

async function ping() {
  await query('SELECT 1 AS ok');
  return true;
}

async function close() {
  const current = pool;
  pool = null;
  poolPromise = null;
  if (current) await current.close();
}

/** Escapes LIKE wildcards so user input is matched literally. */
function likeContains(value) {
  return `%${String(value).replace(/[\\%_[]/g, (c) => `\\${c}`)}%`;
}

module.exports = { sql, getPool, query, transaction, ping, close, likeContains };
