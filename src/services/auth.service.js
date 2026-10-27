'use strict';

const bcrypt = require('bcryptjs');
const db = require('../db/pool');
const { unauthorized } = require('../errors');
const { signToken } = require('../middleware/auth');
const audit = require('./audit.service');

// Compared against when the user does not exist, so response time does not reveal valid usernames.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

async function login(config, { username, password }) {
  const result = await db.query(
    `SELECT id, username, password_hash AS passwordHash, full_name AS fullName, role, is_active AS isActive
     FROM dbo.users WHERE username = @username`,
    { username },
  );
  const user = result.recordset[0];
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

  if (!user || !ok || !user.isActive) {
    await audit.record({ id: user?.id ?? null, username }, 'auth.login_failed', 'user', user?.id ?? null);
    throw unauthorized('Invalid username or password');
  }

  await db.query('UPDATE dbo.users SET last_login_at = SYSUTCDATETIME() WHERE id = @id', { id: user.id });
  await audit.record(user, 'auth.login', 'user', user.id);

  return {
    token: signToken(config, user),
    tokenType: 'Bearer',
    expiresIn: config.jwt.expiresIn,
    user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role },
  };
}

module.exports = { login };
