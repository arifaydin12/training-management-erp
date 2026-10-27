'use strict';

const { rateLimit } = require('express-rate-limit');

function tooMany(message) {
  return (_req, res) =>
    res.status(429).json({ error: { code: 'RATE_LIMITED', message } });
}

/** Brute-force protection: only failed sign-ins count towards the limit. */
function loginLimiter({ windowMs, max }) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: tooMany('Too many failed sign-in attempts. Please try again later.'),
  });
}

/** Coarse per-IP limit for the whole API. */
function apiLimiter({ windowMs = 60 * 1000, max = 300 } = {}) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: tooMany('Too many requests. Please slow down.'),
  });
}

module.exports = { loginLimiter, apiLimiter };
