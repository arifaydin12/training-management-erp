'use strict';

const bcrypt = require('bcryptjs');
const db = require('../db/pool');
const { conflict, notFound } = require('../errors');
const audit = require('./audit.service');

const USER_COLUMNS = `id, username, full_name AS fullName, role, is_active AS isActive,
  created_at AS createdAt, last_login_at AS lastLoginAt`;

async function list() {
  const result = await db.query(`SELECT ${USER_COLUMNS} FROM dbo.users ORDER BY username`);
  return result.recordset;
}

async function getById(id) {
  const result = await db.query(`SELECT ${USER_COLUMNS} FROM dbo.users WHERE id = @id`, { id });
  if (!result.recordset[0]) throw notFound('User');
  return result.recordset[0];
}

async function create({ username, fullName, password, role }, { actor = null, rounds = 10 } = {}) {
  const exists = await db.query('SELECT 1 AS x FROM dbo.users WHERE username = @username', { username });
  if (exists.recordset.length) throw conflict('A user with this username already exists');

  const hash = await bcrypt.hash(password, rounds);
  const result = await db.query(
    `INSERT INTO dbo.users (username, password_hash, full_name, role)
     OUTPUT INSERTED.id
     VALUES (@username, @hash, @fullName, @role)`,
    { username, hash, fullName, role },
  );
  const id = result.recordset[0].id;
  await audit.record(actor, 'user.create', 'user', id, `${username} (${role})`);
  return getById(id);
}

module.exports = { list, getById, create };
