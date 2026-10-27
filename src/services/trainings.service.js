'use strict';

const db = require('../db/pool');
const { likeContains } = require('../db/pool');
const { notFound, conflict, validationError } = require('../errors');
const {
  TRAINING_STATUSES,
  TRAINING_CATEGORIES,
  TRAINING_TRANSITIONS,
  ENROLLABLE_STATUSES,
  ATTENDANCE_STATUSES,
} = require('../constants');
const audit = require('./audit.service');

const COLUMNS = `
  t.id, t.title, t.description, t.category, t.trainer, t.location,
  CONVERT(varchar(10), t.start_date, 23) AS startDate,
  CONVERT(varchar(10), t.end_date, 23) AS endDate,
  t.capacity, t.budget, t.status, t.created_at AS createdAt,
  (SELECT COUNT(*) FROM dbo.training_participants tp WHERE tp.training_id = t.id) AS enrolledCount`;

const SORT_COLUMNS = {
  title: 't.title',
  startDate: 't.start_date',
  category: 't.category',
  status: 't.status',
  capacity: 't.capacity',
  budget: 't.budget',
};

function buildFilter({ search, status, category }) {
  const where = [];
  const params = {};
  if (status) {
    if (!TRAINING_STATUSES.includes(status)) throw validationError([{ in: 'query', field: 'status', message: 'Unknown status' }]);
    where.push('t.status = @status');
    params.status = status;
  }
  if (category) {
    if (!TRAINING_CATEGORIES.includes(category)) throw validationError([{ in: 'query', field: 'category', message: 'Unknown category' }]);
    where.push('t.category = @category');
    params.category = category;
  }
  if (search) {
    where.push(`(t.title LIKE @search ESCAPE '\\' OR t.trainer LIKE @search ESCAPE '\\' OR t.location LIKE @search ESCAPE '\\')`);
    params.search = likeContains(search);
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function list(filters) {
  const { clause, params } = buildFilter(filters);
  const dir = filters.order === 'asc' ? 'ASC' : 'DESC';
  const sort = SORT_COLUMNS[filters.sort] || SORT_COLUMNS.startDate;
  const [count, rows] = await Promise.all([
    db.query(`SELECT COUNT(*) AS total FROM dbo.trainings t ${clause}`, params),
    db.query(
      `SELECT ${COLUMNS} FROM dbo.trainings t ${clause}
       ORDER BY ${sort} ${dir}, t.id DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      { ...params, offset: (filters.page - 1) * filters.pageSize, limit: filters.pageSize },
    ),
  ]);
  return { data: rows.recordset, total: count.recordset[0].total };
}

async function getById(id) {
  const result = await db.query(`SELECT ${COLUMNS} FROM dbo.trainings t WHERE t.id = @id`, { id });
  if (!result.recordset[0]) throw notFound('Training');
  return result.recordset[0];
}

async function listParticipants(trainingId) {
  const result = await db.query(
    `SELECT e.id AS employeeId, e.employee_number AS employeeNumber, e.full_name AS fullName,
            e.department, e.job_title AS jobTitle, tp.status, tp.enrolled_at AS enrolledAt
     FROM dbo.training_participants tp
     JOIN dbo.employees e ON e.id = tp.employee_id
     WHERE tp.training_id = @id
     ORDER BY e.full_name`,
    { id: trainingId },
  );
  return result.recordset;
}

/** Training with participants and attendance summary. */
async function getDetail(id) {
  const training = await getById(id);
  const participants = await listParticipants(id);
  const summary = { enrolled: 0, attended: 0, completed: 0, absent: 0 };
  for (const p of participants) summary[p.status] += 1;
  return { ...training, participants, summary };
}

function params(input) {
  return {
    title: input.title,
    description: input.description,
    category: input.category,
    trainer: input.trainer,
    location: input.location,
    startDate: input.startDate,
    endDate: input.endDate,
    capacity: input.capacity,
    budget: input.budget,
  };
}

async function create(input, actor) {
  const result = await db.query(
    `INSERT INTO dbo.trainings (title, description, category, trainer, location, start_date, end_date, capacity, budget)
     OUTPUT INSERTED.id
     VALUES (@title, @description, @category, @trainer, @location, CAST(@startDate AS DATE), CAST(@endDate AS DATE), @capacity, @budget)`,
    params(input),
  );
  const id = result.recordset[0].id;
  await audit.record(actor, 'training.create', 'training', id, input.title);
  return getById(id);
}

async function update(id, input, actor) {
  const current = await getById(id);
  if (['completed', 'cancelled'].includes(current.status)) {
    throw conflict(`A ${current.status} training can no longer be edited`, 'TRAINING_LOCKED');
  }
  if (input.capacity < current.enrolledCount) {
    throw conflict(
      `Capacity cannot be lower than the ${current.enrolledCount} participants already enrolled`,
      'CAPACITY_TOO_LOW',
    );
  }
  await db.query(
    `UPDATE dbo.trainings
     SET title = @title, description = @description, category = @category, trainer = @trainer,
         location = @location, start_date = CAST(@startDate AS DATE), end_date = CAST(@endDate AS DATE),
         capacity = @capacity, budget = @budget, updated_at = SYSUTCDATETIME()
     WHERE id = @id`,
    { id, ...params(input) },
  );
  await audit.record(actor, 'training.update', 'training', id, input.title);
  return getById(id);
}

async function remove(id, actor) {
  const current = await getById(id);
  await db.query('DELETE FROM dbo.trainings WHERE id = @id', { id });
  await audit.record(actor, 'training.delete', 'training', id, current.title);
}

async function changeStatus(id, status, actor) {
  const current = await getById(id);
  if (!TRAINING_TRANSITIONS[current.status].includes(status)) {
    const allowed = TRAINING_TRANSITIONS[current.status];
    throw conflict(
      allowed.length
        ? `Cannot move a ${current.status} training to ${status}. Allowed: ${allowed.join(', ')}`
        : `A ${current.status} training cannot change status any more`,
      'INVALID_TRANSITION',
    );
  }
  await db.query('UPDATE dbo.trainings SET status = @status, updated_at = SYSUTCDATETIME() WHERE id = @id', { id, status });
  await audit.record(actor, 'training.status', 'training', id, `${current.status} -> ${status}`);
  return getById(id);
}

// ------------------------------------------------------------ participants

async function addParticipant(trainingId, employeeId, actor) {
  const added = await db.transaction(async (run) => {
    // UPDLOCK + HOLDLOCK serialises concurrent enrolments for the same training,
    // so the capacity check below cannot be raced.
    const t = await run(
      `SELECT id, title, status, capacity FROM dbo.trainings WITH (UPDLOCK, HOLDLOCK) WHERE id = @id`,
      { id: trainingId },
    );
    const training = t.recordset[0];
    if (!training) throw notFound('Training');
    if (!ENROLLABLE_STATUSES.includes(training.status)) {
      throw conflict(`Enrolment is closed: the training is ${training.status}`, 'TRAINING_CLOSED');
    }

    const e = await run('SELECT id, full_name, status FROM dbo.employees WHERE id = @id', { id: employeeId });
    const employee = e.recordset[0];
    if (!employee) throw notFound('Employee');
    if (employee.status !== 'active') {
      throw conflict('Inactive employees cannot be enrolled', 'EMPLOYEE_INACTIVE');
    }

    const dup = await run(
      'SELECT 1 AS x FROM dbo.training_participants WHERE training_id = @t AND employee_id = @e',
      { t: trainingId, e: employeeId },
    );
    if (dup.recordset.length) throw conflict('Employee is already enrolled in this training', 'ALREADY_ENROLLED');

    const count = await run('SELECT COUNT(*) AS n FROM dbo.training_participants WHERE training_id = @t', { t: trainingId });
    if (count.recordset[0].n >= training.capacity) {
      throw conflict(`This training is full (capacity ${training.capacity})`, 'CAPACITY_FULL');
    }

    await run('INSERT INTO dbo.training_participants (training_id, employee_id) VALUES (@t, @e)', {
      t: trainingId,
      e: employeeId,
    });
    return { training, employee };
  });
  await audit.record(actor, 'participant.add', 'training', trainingId, `${added.employee.full_name} -> ${added.training.title}`);
  return getDetail(trainingId);
}

async function loadParticipant(trainingId, employeeId) {
  const result = await db.query(
    `SELECT tp.status, t.status AS trainingStatus, t.title, e.full_name AS fullName
     FROM dbo.training_participants tp
     JOIN dbo.trainings t ON t.id = tp.training_id
     JOIN dbo.employees e ON e.id = tp.employee_id
     WHERE tp.training_id = @t AND tp.employee_id = @e`,
    { t: trainingId, e: employeeId },
  );
  if (!result.recordset[0]) throw notFound('Participant');
  return result.recordset[0];
}

async function setParticipantStatus(trainingId, employeeId, status, actor) {
  const p = await loadParticipant(trainingId, employeeId);
  if (!ATTENDANCE_STATUSES.includes(p.trainingStatus)) {
    throw conflict(
      `Attendance can only be recorded for trainings that are in progress or completed (this one is ${p.trainingStatus})`,
      'ATTENDANCE_NOT_ALLOWED',
    );
  }
  await db.query(
    `UPDATE dbo.training_participants SET status = @status, updated_at = SYSUTCDATETIME()
     WHERE training_id = @t AND employee_id = @e`,
    { t: trainingId, e: employeeId, status },
  );
  await audit.record(actor, 'participant.status', 'training', trainingId, `${p.fullName}: ${p.status} -> ${status}`);
  return getDetail(trainingId);
}

async function removeParticipant(trainingId, employeeId, actor) {
  const p = await loadParticipant(trainingId, employeeId);
  if (!ENROLLABLE_STATUSES.includes(p.trainingStatus)) {
    throw conflict(`Participants cannot be removed from a ${p.trainingStatus} training`, 'TRAINING_CLOSED');
  }
  await db.query('DELETE FROM dbo.training_participants WHERE training_id = @t AND employee_id = @e', {
    t: trainingId,
    e: employeeId,
  });
  await audit.record(actor, 'participant.remove', 'training', trainingId, `${p.fullName} <- ${p.title}`);
  return getDetail(trainingId);
}

module.exports = {
  list,
  getById,
  getDetail,
  listParticipants,
  create,
  update,
  remove,
  changeStatus,
  addParticipant,
  setParticipantStatus,
  removeParticipant,
};
