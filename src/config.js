'use strict';

const crypto = require('node:crypto');
require('dotenv').config({ quiet: true });

function toInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  let jwtSecret = env.JWT_SECRET;
  let ephemeralSecret = false;
  if (!jwtSecret) {
    if (isProduction) {
      throw new Error('JWT_SECRET must be set when NODE_ENV=production');
    }
    // Development convenience: a random secret that lives only as long as the process.
    jwtSecret = crypto.randomBytes(32).toString('hex');
    ephemeralSecret = true;
  } else if (jwtSecret.length < 16) {
    throw new Error('JWT_SECRET must be at least 16 characters long');
  }

  return {
    nodeEnv,
    isProduction,
    isTest: nodeEnv === 'test',
    port: toInt(env.PORT, 3000),
    jwt: {
      secret: jwtSecret,
      ephemeral: ephemeralSecret,
      expiresIn: env.JWT_EXPIRES_IN || '8h',
    },
    // Comma-separated list of allowed browser origins. Empty = same-origin only.
    corsOrigins: (env.CORS_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    loginRateLimit: {
      windowMs: toInt(env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
      max: toInt(env.LOGIN_RATE_LIMIT_MAX, 10),
    },
    logRequests: toBool(env.LOG_REQUESTS, nodeEnv !== 'test'),
    bcryptRounds: toInt(env.BCRYPT_ROUNDS, nodeEnv === 'test' ? 4 : 10),
    db: {
      server: env.DB_SERVER || 'localhost',
      port: toInt(env.DB_PORT, 1433),
      database: env.DB_NAME || 'TrainingErp',
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      encrypt: toBool(env.DB_ENCRYPT, false),
      trustServerCertificate: toBool(env.DB_TRUST_SERVER_CERT, true),
    },
  };
}

module.exports = { loadConfig };
