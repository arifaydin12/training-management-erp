'use strict';

const jwt = require('jsonwebtoken');
const { unauthorized, forbidden } = require('../errors');

function signToken(config, user) {
  return jwt.sign(
    { sub: String(user.id), username: user.username, name: user.fullName, role: user.role },
    config.jwt.secret,
    { algorithm: 'HS256', expiresIn: config.jwt.expiresIn },
  );
}

/** Verifies the Bearer token and attaches req.user. */
function authenticate(config) {
  return (req, _res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return next(unauthorized());

    try {
      const payload = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });
      req.user = {
        id: Number(payload.sub),
        username: payload.username,
        fullName: payload.name,
        role: payload.role,
      };
      return next();
    } catch (err) {
      const message = err.name === 'TokenExpiredError' ? 'Session expired, please sign in again' : 'Invalid token';
      return next(unauthorized(message));
    }
  };
}

/** Allows the request only for the listed roles (use after authenticate). */
function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    return next();
  };
}

module.exports = { signToken, authenticate, authorize };
