'use strict';

const db = require('../db/pool');
const { likeContains } = require('../db/pool');

/**
 * Appends an audit entry. Failures are logged but never break the request:
 * the audit trail is best effort and must not mask the real result.
 */
async function record(actor, action, entity, entityId = null, details = null) {
  try {
    await db.query(
      `INSERT INTO dbo.audit_log (user_id, username, action, entity, entity_id, details)
       VALUES (@userId, @username, @action, @entity, @entityId, @details)`,
      {
        userId: actor?.id ?? null,
        username: actor?.username ?? null,
        action,
        entity,
        entityId,
        details: details ? String(details).slice(0, 500) : null,
      },
    );
  } catch (err) {
    console.error('[audit] failed to write entry:', err.message);
  }
}

async function list({ page, pageSize, entity, search }) {
  const where = [];
  const params = {};
  if (entity) {
    where.push('entity = @entity');
    params.entity = entity;
  }
  if (search) {
    where.push(`(username LIKE @search ESCAPE '\\' OR action LIKE @search ESCAPE '\\' OR details LIKE @search ESCAPE '\\')`);
    params.search = likeContains(search);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [count, rows] = await Promise.all([
    db.query(`SELECT COUNT(*) AS total FROM dbo.audit_log ${clause}`, params),
    db.query(
      `SELECT id, user_id AS userId, username, action, entity, entity_id AS entityId, details, created_at AS createdAt
       FROM dbo.audit_log ${clause}
       ORDER BY id DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      { ...params, offset: (page - 1) * pageSize, limit: pageSize },
    ),
  ]);
  return { data: rows.recordset, total: count.recordset[0].total };
}

module.exports = { record, list };
