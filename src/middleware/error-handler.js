'use strict';

const { HttpError } = require('../errors');

// Friendly messages for database constraint violations (see database/schema.sql).
const CONSTRAINT_MESSAGES = {
  uq_users_username: 'A user with this username already exists',
  uq_employees_email: 'An employee with this email already exists',
  uq_employees_number: 'An employee with this employee number already exists',
};

function constraintName(message = '') {
  const match = /constraint '([^']+)'/i.exec(message);
  return match ? match[1] : null;
}

function notFoundHandler(req, _res, next) {
  next(new HttpError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.path}`));
}

function toHttpError(err) {
  if (err instanceof HttpError) return err;

  if (err.type === 'entity.parse.failed') {
    return new HttpError(400, 'BAD_REQUEST', 'Request body is not valid JSON');
  }
  if (err.type === 'entity.too.large') {
    return new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }

  // SQL Server: 2627 / 2601 = unique violation, 547 = FK / CHECK violation.
  if (err.number === 2627 || err.number === 2601) {
    const message = CONSTRAINT_MESSAGES[constraintName(err.message)] || 'A record with these values already exists';
    return new HttpError(409, 'CONFLICT', message);
  }
  if (err.number === 547) {
    return new HttpError(409, 'CONSTRAINT_VIOLATION', 'The operation conflicts with existing data');
  }
  return null;
}

/** Consistent error body: { error: { code, message, details? } } */
function errorHandler(logger = console) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);

    const known = toHttpError(err);
    if (known) {
      const body = { error: { code: known.code, message: known.message } };
      if (known.details) body.error.details = known.details;
      return res.status(known.status).json(body);
    }

    logger.error(`[error] ${req.method} ${req.originalUrl}`, err);
    return res
      .status(500)
      .json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side' } });
  };
}

module.exports = { errorHandler, notFoundHandler };
