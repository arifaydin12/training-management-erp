'use strict';

const { validationError } = require('../errors');

/**
 * Validates req.body / req.query / req.params against zod schemas.
 * Parsed values are exposed as req.valid.{body,query,params}; the raw request
 * objects are never trusted past this point.
 */
function validate(schemas) {
  return (req, _res, next) => {
    const issues = [];
    req.valid = req.valid || {};

    for (const part of ['params', 'query', 'body']) {
      const schema = schemas[part];
      if (!schema) continue;
      const input = part === 'body' ? (req.body ?? {}) : req[part];
      const result = schema.safeParse(input);
      if (result.success) {
        req.valid[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          issues.push({
            in: part,
            field: issue.path.join('.') || part,
            message: issue.message,
          });
        }
      }
    }

    if (issues.length) return next(validationError(issues));
    return next();
  };
}

module.exports = { validate };
