'use strict';

const db = require('../db/pool');
const { likeContains } = require('../db/pool');
const { notFound, validationError } = require('../errors');
const { DEPARTMENTS, EMPLOYEE_STATUSES } = require('../constants');
const audit = require('./audit.service');

const COLUMNS = `
  e.id,
  e.employee_number AS employeeNumber,
  e.full_name AS fullName,
  e.email,
  e.department,
  e.job_title AS jobTitle,
  CONVERT(varchar(10), e.hire_date, 23) AS hireDate,
  e.status,
  e.created_at AS createdAt,
  (SELECT COUNT(*) FROM dbo.training_participants tp WHERE tp.employee_id = e.id) AS trainingCount`;

const SORT_COLUMNS = {
  fullName: 'e.full_name',
  department: 'e.department',
  jobTitle: 'e.job_title',
  hireDate: 'e.hire_date',
  employeeNumber: 'e.employee_number',
  status: 'e.status',
};

function buildFilter({ search, department, status }) {
  const where = [];
  const params = {};

  if (department) {
    if (!DEPARTMENTS.includes(department)) throw validationError([{ in: 'query', field: 'department', message: 'Unknown department' }]);
    where.push('e.department = @department');
    params.department = department;
  }
  if (status) {
    if (!EMPLOYEE_STATUSES.includes(status)) throw validationError([{ in: 'query', field: 'status', message: 'Status must be active or inactive' }]);
    where.push('e.status = @status');
    params.status = status;
  }
  if (search) {
    where.push(`(e.full_name LIKE @search ESCAPE '\\' OR e.email LIKE @search ESCAPE '\\'
                 OR e.job_title LIKE @search ESCAPE '\\' OR e.employee_number LIKE @search ESCAPE '\\')`);
    params.search = likeContains(search);
  }
  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

function orderBy({ sort, order }) {
  const dir = order === 'desc' ? 'DESC' : 'ASC';
  // Both parts come from fixed whitelists, never from raw user input.
  return `ORDER BY ${SORT_COLUMNS[sort] || SORT_COLUMNS.fullName} ${dir}, e.id ASC`;
}

async function list(filters) {
  const { clause, params } = buildFilter(filters);
  const [count, rows] = await Promise.all([
    db.query(`SELECT COUNT(*) AS total FROM dbo.employees e ${clause}`, params),
    db.query(
      `SELECT ${COLUMNS} FROM dbo.employees e ${clause} ${orderBy(filters)}
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      { ...params, offset: (filters.page - 1) * filters.pageSize, limit: filters.pageSize },
    ),
  ]);
  return { data: rows.recordset, total: count.recordset[0].total };
}

async function listAll(filters, max = 10000) {
  const { clause, params } = buildFilter(filters);
  const rows = await db.query(
    `SELECT TOP (${Number(max)}) ${COLUMNS} FROM dbo.employees e ${clause} ${orderBy(filters)}`,
    params,
  );
  return rows.recordset;
}

async function getById(id) {
  const result = await db.query(`SELECT ${COLUMNS} FROM dbo.employees e WHERE e.id = @id`, { id });
  if (!result.recordset[0]) throw notFound('Employee');
  return result.recordset[0];
}

/** Employee profile together with every training they are enrolled in. */
async function getDetail(id) {
  const employee = await getById(id);
  const trainings = await db.query(
    `SELECT t.id AS trainingId, t.title, t.category, t.trainer,
            CONVERT(varchar(10), t.start_date, 23) AS startDate,
            CONVERT(varchar(10), t.end_date, 23) AS endDate,
            t.status AS trainingStatus, tp.status AS participationStatus
     FROM dbo.training_participants tp
     JOIN dbo.trainings t ON t.id = tp.training_id
     WHERE tp.employee_id = @id
     ORDER BY t.start_date DESC, t.id DESC`,
    { id },
  );
  return { ...employee, trainings: trainings.recordset };
}

async function create(input, actor) {
  const id = await db.transaction(async (run) => {
    const result = await run(
      `INSERT INTO dbo.employees (employee_number, full_name, email, department, job_title, hire_date, status)
       OUTPUT INSERTED.id
       VALUES (@number, @fullName, @email, @department, @jobTitle, CAST(@hireDate AS DATE), @status)`,
      {
        number: input.employeeNumber || `TMP-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 20),
        fullName: input.fullName,
        email: input.email,
        department: input.department,
        jobTitle: input.jobTitle,
        hireDate: input.hireDate,
        status: input.status,
      },
    );
    const newId = result.recordset[0].id;
    if (!input.employeeNumber) {
      await run(
        `UPDATE dbo.employees SET employee_number = N'EMP-' + RIGHT(N'0000' + CAST(id AS NVARCHAR(10)), 4) WHERE id = @id`,
        { id: newId },
      );
    }
    return newId;
  });
  await audit.record(actor, 'employee.create', 'employee', id, input.fullName);
  return getById(id);
}

async function update(id, input, actor) {
  const current = await getById(id);
  await db.query(
    `UPDATE dbo.employees
     SET employee_number = @number, full_name = @fullName, email = @email, department = @department,
         job_title = @jobTitle, hire_date = CAST(@hireDate AS DATE), status = @status,
         updated_at = SYSUTCDATETIME()
     WHERE id = @id`,
    {
      id,
      number: input.employeeNumber || current.employeeNumber,
      fullName: input.fullName,
      email: input.email,
      department: input.department,
      jobTitle: input.jobTitle,
      hireDate: input.hireDate,
      status: input.status,
    },
  );
  await audit.record(actor, 'employee.update', 'employee', id, input.fullName);
  return getById(id);
}

async function remove(id, actor) {
  const current = await getById(id);
  await db.query('DELETE FROM dbo.employees WHERE id = @id', { id });
  await audit.record(actor, 'employee.delete', 'employee', id, current.fullName);
}

async function departmentsInUse() {
  const result = await db.query('SELECT DISTINCT department FROM dbo.employees ORDER BY department');
  return result.recordset.map((r) => r.department);
}

module.exports = { list, listAll, getById, getDetail, create, update, remove, departmentsInUse };
