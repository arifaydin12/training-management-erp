'use strict';

/** An error that is safe to show to API clients. */
class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (message, details) => new HttpError(400, 'BAD_REQUEST', message, details);
const validationError = (details, message = 'Validation failed') =>
  new HttpError(422, 'VALIDATION_ERROR', message, details);
const unauthorized = (message = 'Authentication required') =>
  new HttpError(401, 'UNAUTHORIZED', message);
const forbidden = (message = 'You do not have permission to perform this action') =>
  new HttpError(403, 'FORBIDDEN', message);
const notFound = (what = 'Resource') => new HttpError(404, 'NOT_FOUND', `${what} not found`);
const conflict = (message, code = 'CONFLICT') => new HttpError(409, code, message);

module.exports = {
  HttpError,
  badRequest,
  validationError,
  unauthorized,
  forbidden,
  notFound,
  conflict,
};
