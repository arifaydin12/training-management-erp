// In-browser mock of the REST API, used in demo mode (GitHub Pages).
// It exposes exactly the same methods as http.js and enforces the same rules as the server:
// roles, validation, status workflow, capacity, duplicates and attendance. Data lives in
// localStorage, so it survives reloads but never leaves the browser.
import { ApiError } from './errors.js';
import { generateSeed, DEMO_PASSWORD, todayISO, addDays } from '../demo/seed-data.js';
import {
  META, DEPARTMENTS, TRAINING_CATEGORIES, EMPLOYEE_STATUSES, TRAINING_STATUSES, PARTICIPANT_STATUSES,
  TRAINING_TRANSITIONS, ENROLLABLE_STATUSES, ATTENDANCE_STATUSES,
} from '../constants.js';
import { toCsv } from '../util/csv.js';

const STORAGE_KEY = 'erp.demo.db.v1';
const MAX_AGE_DAYS = 10; // seeded dates are relative to "today"; refresh the data when it gets stale

// ------------------------------------------------------------------ storage
let db = null;

function seed() {
  const data = generateSeed();
  const users = data.users.map((u, i) => ({ id: i + 1, ...u, isActive: true, createdAt: `${addDays(todayISO(), -300)}T08:00:00.000Z`, lastLoginAt: null }));
  return {
    seededOn: todayISO(),
    users,
    employees: data.employees,
    trainings: data.trainings,
    participants: data.participants,
    audit: data.audit.map((a) => ({ ...a, userId: users.find((u) => u.username === a.username)?.id ?? null })),
    next: { user: users.length + 1, employee: data.employees.length + 1, training: data.trainings.length + 1, audit: data.audit.length + 1 },
  };
}

function ageInDays(iso) {
  return Math.round((Date.now() - new Date(`${iso}T00:00:00Z`).getTime()) / 86400000);
}

function load() {
  if (db) return db;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.seededOn && ageInDays(parsed.seededOn) <= MAX_AGE_DAYS) {
        db = parsed;
        return db;
      }
    }
  } catch (_e) { /* corrupt storage: start over */ }
  db = seed();
  persist();
  return db;
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (_e) { /* storage full or unavailable: keep working in memory */ }
}

// ------------------------------------------------------------------ helpers
const wait = () => new Promise((r) => setTimeout(r, 60 + Math.random() * 80));
const clone = (x) => JSON.parse(JSON.stringify(x));

const unauthorized = (m = 'Authentication required') => new ApiError(401, 'UNAUTHORIZED', m);
const forbidden = () => new ApiError(403, 'FORBIDDEN', 'You do not have permission to perform this action');
const notFound = (what) => new ApiError(404, 'NOT_FOUND', `${what} not found`);
const conflict = (m, code = 'CONFLICT') => new ApiError(409, code, m);
const invalid = (details) => new ApiError(422, 'VALIDATION_ERROR', 'Validation failed', details);

const isIsoDate = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function text(details, body, field, label, { max = 100, required = true } = {}) {
  const raw = body[field];
  if (raw === undefined || raw === null || raw === '') {
    if (required) details.push({ in: 'body', field, message: `${label} is required` });
    return null;
  }
  if (typeof raw !== 'string') { details.push({ in: 'body', field, message: `${label} must be text` }); return null; }
  const v = raw.trim();
  if (!v && required) { details.push({ in: 'body', field, message: `${label} is required` }); return null; }
  if (v.length > max) { details.push({ in: 'body', field, message: `${label} must be at most ${max} characters` }); return null; }
  return v || null;
}

// ------------------------------------------------------------------ session
let currentUsername = null;

function currentUser() {
  const user = load().users.find((u) => u.username === currentUsername && u.isActive);
  if (!user) throw unauthorized();
  return user;
}

function guard(...roles) {
  const user = currentUser();
  if (roles.length && !roles.includes(user.role)) throw forbidden();
  return user;
}
const WRITE = ['admin', 'hr_manager'];

function audit(user, action, entity, entityId, details) {
  const d = load();
  d.audit.push({ id: d.next.audit++, userId: user?.id ?? null, username: user?.username ?? null, action, entity, entityId, details: details ? String(details).slice(0, 500) : null, createdAt: new Date().toISOString() });
  if (d.audit.length > 600) d.audit.splice(0, d.audit.length - 600);
}

// ------------------------------------------------------------------ DTOs
const enrolledCount = (trainingId) => load().participants.filter((p) => p.trainingId === trainingId).length;
const trainingCountOf = (employeeId) => load().participants.filter((p) => p.employeeId === employeeId).length;
const employeeDTO = (e) => ({ ...e, trainingCount: trainingCountOf(e.id) });
const trainingDTO = (t) => ({ ...t, enrolledCount: enrolledCount(t.id) });

function paginate(rows, { page, pageSize }) {
  const total = rows.length;
  return { data: rows.slice((page - 1) * pageSize, page * pageSize), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

function pageParams(q, queryDetails) {
  const page = q.page === undefined || q.page === '' ? 1 : Number(q.page);
  const pageSize = q.pageSize === undefined || q.pageSize === '' ? 10 : Number(q.pageSize);
  if (!Number.isInteger(page) || page < 1) queryDetails.push({ in: 'query', field: 'page', message: 'page must be at least 1' });
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) queryDetails.push({ in: 'query', field: 'pageSize', message: 'pageSize must be between 1 and 100' });
  return { page, pageSize };
}

function compare(a, b, order) {
  const r = typeof a === 'number' && typeof b === 'number' ? a - b : String(a ?? '').localeCompare(String(b ?? ''), 'en', { sensitivity: 'base' });
  return order === 'desc' ? -r : r;
}

// ------------------------------------------------------------------ employees
function validateEmployee(body) {
  const details = [];
  const fullName = text(details, body, 'fullName', 'Full name');
  const jobTitle = text(details, body, 'jobTitle', 'Job title', { max: 80 });
  let email = text(details, body, 'email', 'Email', { max: 120 });
  if (email) { email = email.toLowerCase(); if (!EMAIL_RE.test(email)) details.push({ in: 'body', field: 'email', message: 'Email must be a valid address' }); }
  if (!DEPARTMENTS.includes(body.department)) details.push({ in: 'body', field: 'department', message: `Department must be one of: ${DEPARTMENTS.join(', ')}` });
  const hireDate = body.hireDate || null;
  if (hireDate && !isIsoDate(hireDate)) details.push({ in: 'body', field: 'hireDate', message: 'Hire date must be a valid date in YYYY-MM-DD format' });
  const status = body.status === undefined ? 'active' : body.status;
  if (!EMPLOYEE_STATUSES.includes(status)) details.push({ in: 'body', field: 'status', message: `Status must be one of: ${EMPLOYEE_STATUSES.join(', ')}` });
  const employeeNumber = body.employeeNumber ? String(body.employeeNumber).trim() : undefined;
  if (employeeNumber && !/^[A-Za-z0-9-]{3,20}$/.test(employeeNumber)) details.push({ in: 'body', field: 'employeeNumber', message: 'Employee number must be 3-20 letters, digits or dashes' });
  if (details.length) throw invalid(details);
  return { fullName, email, department: body.department, jobTitle, hireDate, status, employeeNumber };
}

function assertUniqueEmployee(d, input, exceptId) {
  if (d.employees.some((e) => e.id !== exceptId && e.email === input.email)) throw conflict('An employee with this email already exists');
  if (input.employeeNumber && d.employees.some((e) => e.id !== exceptId && e.employeeNumber.toLowerCase() === input.employeeNumber.toLowerCase())) {
    throw conflict('An employee with this employee number already exists');
  }
}

function filterEmployees(q) {
  const details = [];
  if (q.department && !DEPARTMENTS.includes(q.department)) details.push({ in: 'query', field: 'department', message: 'Unknown department' });
  if (q.status && !EMPLOYEE_STATUSES.includes(q.status)) details.push({ in: 'query', field: 'status', message: 'Status must be active or inactive' });
  const sort = q.sort || 'fullName';
  if (!['fullName', 'department', 'jobTitle', 'hireDate', 'employeeNumber', 'status'].includes(sort)) details.push({ in: 'query', field: 'sort', message: 'Unknown sort field' });
  const paging = pageParams(q, details);
  if (details.length) throw invalid(details);

  const s = (q.search || '').trim().toLowerCase();
  let rows = load().employees.filter((e) =>
    (!q.department || e.department === q.department) &&
    (!q.status || e.status === q.status) &&
    (!s || [e.fullName, e.email, e.jobTitle, e.employeeNumber].some((f) => f.toLowerCase().includes(s))));
  const order = q.order === 'desc' ? 'desc' : 'asc';
  rows = rows.sort((a, b) => compare(a[sort], b[sort], order) || a.id - b.id);
  return { rows, paging };
}

// ------------------------------------------------------------------ trainings
function validateTraining(body) {
  const details = [];
  const title = text(details, body, 'title', 'Title', { max: 150 });
  const trainer = text(details, body, 'trainer', 'Trainer');
  const description = text(details, body, 'description', 'Description', { max: 1000, required: false });
  const location = text(details, body, 'location', 'Location', { required: false });
  if (!TRAINING_CATEGORIES.includes(body.category)) details.push({ in: 'body', field: 'category', message: `Category must be one of: ${TRAINING_CATEGORIES.join(', ')}` });
  if (!isIsoDate(body.startDate)) details.push({ in: 'body', field: 'startDate', message: 'Start date must be a valid date in YYYY-MM-DD format' });
  if (!isIsoDate(body.endDate)) details.push({ in: 'body', field: 'endDate', message: 'End date must be a valid date in YYYY-MM-DD format' });
  else if (isIsoDate(body.startDate) && body.endDate < body.startDate) details.push({ in: 'body', field: 'endDate', message: 'End date cannot be before the start date' });
  if (typeof body.capacity !== 'number' || !Number.isInteger(body.capacity)) details.push({ in: 'body', field: 'capacity', message: 'Capacity must be a whole number' });
  else if (body.capacity < 1 || body.capacity > 1000) details.push({ in: 'body', field: 'capacity', message: 'Capacity must be between 1 and 1000' });
  const budget = body.budget === undefined || body.budget === null ? 0 : body.budget;
  if (typeof budget !== 'number' || Number.isNaN(budget)) details.push({ in: 'body', field: 'budget', message: 'Budget must be a number' });
  else if (budget < 0) details.push({ in: 'body', field: 'budget', message: 'Budget cannot be negative' });
  else if (budget > 10000000) details.push({ in: 'body', field: 'budget', message: 'Budget is too large' });
  if (details.length) throw invalid(details);
  return { title, description, category: body.category, trainer, location, startDate: body.startDate, endDate: body.endDate, capacity: body.capacity, budget };
}

function trainingDetail(id) {
  const d = load();
  const t = d.trainings.find((x) => x.id === id);
  if (!t) throw notFound('Training');
  const participants = d.participants
    .filter((p) => p.trainingId === id)
    .map((p) => {
      const e = d.employees.find((x) => x.id === p.employeeId);
      return { employeeId: e.id, employeeNumber: e.employeeNumber, fullName: e.fullName, department: e.department, jobTitle: e.jobTitle, status: p.status, enrolledAt: p.enrolledAt };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  const summary = { enrolled: 0, attended: 0, completed: 0, absent: 0 };
  participants.forEach((p) => { summary[p.status] += 1; });
  return { ...trainingDTO(t), participants, summary };
}

// ------------------------------------------------------------------ dashboard
function dashboard() {
  const d = load();
  const today = todayISO();
  const year = today.slice(0, 4);
  const kpiTrainings = d.trainings;
  const finished = d.participants.filter((p) => kpiTrainings.find((t) => t.id === p.trainingId)?.status === 'completed');
  const completedP = finished.filter((p) => p.status === 'completed');

  const now = new Date();
  const months = [];
  for (let i = -9; i <= 2; i += 1) months.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1)));
  const key = (m) => `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}`;

  const count = (list, prop) => {
    const map = new Map();
    list.forEach((x) => map.set(x[prop], (map.get(x[prop]) || 0) + 1));
    return map;
  };

  return {
    kpis: {
      activeEmployees: d.employees.filter((e) => e.status === 'active').length,
      totalEmployees: d.employees.length,
      upcomingTrainings: kpiTrainings.filter((t) => t.status === 'planned' && t.startDate >= today).length,
      inProgressTrainings: kpiTrainings.filter((t) => t.status === 'in_progress').length,
      completedThisYear: kpiTrainings.filter((t) => t.status === 'completed' && t.startDate.startsWith(year)).length,
      budgetThisYear: kpiTrainings.filter((t) => t.status !== 'cancelled' && t.startDate.startsWith(year)).reduce((s, t) => s + t.budget, 0),
      totalEnrollments: d.participants.length,
      completionRate: finished.length ? Math.round((completedP.length / finished.length) * 100) : 0,
    },
    departmentDistribution: [...count(d.employees.filter((e) => e.status === 'active'), 'department')]
      .map(([department, c]) => ({ department, count: c }))
      .sort((a, b) => b.count - a.count || a.department.localeCompare(b.department)),
    trainingsByStatus: [...count(d.trainings, 'status')].map(([status, c]) => ({ status, count: c })),
    upcomingTrainings: d.trainings
      .filter((t) => ['planned', 'in_progress'].includes(t.status) && t.endDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id)
      .slice(0, 6)
      .map((t) => ({ id: t.id, title: t.title, category: t.category, trainer: t.trainer, startDate: t.startDate, endDate: t.endDate, status: t.status, capacity: t.capacity, enrolledCount: enrolledCount(t.id) })),
    budgetByMonth: months.map((m) => {
      const k = key(m);
      const rows = d.trainings.filter((t) => t.status !== 'cancelled' && t.startDate.startsWith(k));
      return { month: k, budget: rows.reduce((s, t) => s + t.budget, 0), trainings: rows.length };
    }),
  };
}

// ------------------------------------------------------------------ public API
export function createMockApi() {
  const api = { mode: 'demo', demo: true, onUnauthorized: null, demoPassword: DEMO_PASSWORD };
  load();

  api.setToken = (token) => {
    currentUsername = token && token.startsWith('demo.') ? token.split('.')[1] : null;
  };

  api.resetDemo = async () => {
    await wait();
    db = seed();
    persist();
  };

  const run = async (fn) => {
    await wait();
    const result = fn();
    persist();
    return clone(result);
  };

  api.auth = {
    login: (username, password) => run(() => {
      const d = load();
      const user = d.users.find((u) => u.username === String(username || '').trim() && u.isActive);
      if (!username || !password) throw invalid([{ in: 'body', field: !username ? 'username' : 'password', message: `${!username ? 'Username' : 'Password'} is required` }]);
      if (!user || password !== DEMO_PASSWORD) throw unauthorized('Invalid username or password');
      user.lastLoginAt = new Date().toISOString();
      audit(user, 'auth.login', 'user', user.id);
      return { token: `demo.${user.username}.${Date.now()}`, tokenType: 'Bearer', expiresIn: '8h', user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role } };
    }),
    me: () => run(() => ({ user: currentUser() })),
  };

  api.meta = () => run(() => { currentUser(); return META; });
  api.dashboard = () => run(() => { currentUser(); return dashboard(); });

  api.employees = {
    list: (q = {}) => run(() => {
      currentUser();
      const { rows, paging } = filterEmployees(q);
      const result = paginate(rows, paging);
      result.data = result.data.map(employeeDTO);
      return result;
    }),
    get: (id) => run(() => {
      currentUser();
      const d = load();
      const e = d.employees.find((x) => x.id === Number(id));
      if (!e) throw notFound('Employee');
      const trainings = d.participants
        .filter((p) => p.employeeId === e.id)
        .map((p) => {
          const t = d.trainings.find((x) => x.id === p.trainingId);
          return { trainingId: t.id, title: t.title, category: t.category, trainer: t.trainer, startDate: t.startDate, endDate: t.endDate, trainingStatus: t.status, participationStatus: p.status };
        })
        .sort((a, b) => b.startDate.localeCompare(a.startDate));
      return { ...employeeDTO(e), trainings };
    }),
    create: (body) => run(() => {
      const user = guard(...WRITE);
      const d = load();
      const input = validateEmployee(body);
      assertUniqueEmployee(d, input);
      const id = d.next.employee++;
      const e = {
        id, employeeNumber: input.employeeNumber || `EMP-${String(id).padStart(4, '0')}`, fullName: input.fullName, email: input.email,
        department: input.department, jobTitle: input.jobTitle, hireDate: input.hireDate, status: input.status, createdAt: new Date().toISOString(),
      };
      d.employees.push(e);
      audit(user, 'employee.create', 'employee', id, e.fullName);
      return employeeDTO(e);
    }),
    update: (id, body) => run(() => {
      const user = guard(...WRITE);
      const d = load();
      const e = d.employees.find((x) => x.id === Number(id));
      if (!e) throw notFound('Employee');
      const input = validateEmployee(body);
      assertUniqueEmployee(d, input, e.id);
      Object.assign(e, { fullName: input.fullName, email: input.email, department: input.department, jobTitle: input.jobTitle, hireDate: input.hireDate, status: input.status, employeeNumber: input.employeeNumber || e.employeeNumber });
      audit(user, 'employee.update', 'employee', e.id, e.fullName);
      return employeeDTO(e);
    }),
    remove: (id) => run(() => {
      const user = guard('admin');
      const d = load();
      const e = d.employees.find((x) => x.id === Number(id));
      if (!e) throw notFound('Employee');
      d.employees = d.employees.filter((x) => x.id !== e.id);
      d.participants = d.participants.filter((p) => p.employeeId !== e.id);
      audit(user, 'employee.delete', 'employee', e.id, e.fullName);
      return null;
    }),
    exportCsv: (q = {}) => run(() => {
      currentUser();
      const { rows } = filterEmployees({ ...q, page: 1, pageSize: 100 });
      const csv = toCsv([
        { header: 'Employee number', value: (r) => r.employeeNumber },
        { header: 'Full name', value: (r) => r.fullName },
        { header: 'Email', value: (r) => r.email },
        { header: 'Department', value: (r) => r.department },
        { header: 'Job title', value: (r) => r.jobTitle },
        { header: 'Hire date', value: (r) => r.hireDate },
        { header: 'Status', value: (r) => r.status },
        { header: 'Trainings', value: (r) => trainingCountOf(r.id) },
      ], rows);
      return { csv, filename: `employees-${todayISO()}.csv` };
    }).then(({ csv, filename }) => ({ blob: new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename })),
  };

  api.trainings = {
    list: (q = {}) => run(() => {
      currentUser();
      const details = [];
      if (q.status && !TRAINING_STATUSES.includes(q.status)) details.push({ in: 'query', field: 'status', message: 'Unknown status' });
      if (q.category && !TRAINING_CATEGORIES.includes(q.category)) details.push({ in: 'query', field: 'category', message: 'Unknown category' });
      const sort = q.sort || 'startDate';
      if (!['title', 'startDate', 'category', 'status', 'capacity', 'budget'].includes(sort)) details.push({ in: 'query', field: 'sort', message: 'Unknown sort field' });
      const paging = pageParams(q, details);
      if (details.length) throw invalid(details);
      const s = (q.search || '').trim().toLowerCase();
      const order = q.order === 'asc' ? 'asc' : 'desc';
      const rows = load().trainings
        .filter((t) => (!q.status || t.status === q.status) && (!q.category || t.category === q.category) && (!s || [t.title, t.trainer, t.location || ''].some((f) => f.toLowerCase().includes(s))))
        .sort((a, b) => compare(a[sort], b[sort], order) || b.id - a.id);
      const result = paginate(rows, paging);
      result.data = result.data.map(trainingDTO);
      return result;
    }),
    get: (id) => run(() => { currentUser(); return trainingDetail(Number(id)); }),
    create: (body) => run(() => {
      const user = guard(...WRITE);
      const d = load();
      const input = validateTraining(body);
      const t = { id: d.next.training++, ...input, status: 'planned', createdAt: new Date().toISOString() };
      d.trainings.push(t);
      audit(user, 'training.create', 'training', t.id, t.title);
      return trainingDTO(t);
    }),
    update: (id, body) => run(() => {
      const user = guard(...WRITE);
      const t = load().trainings.find((x) => x.id === Number(id));
      if (!t) throw notFound('Training');
      const input = validateTraining(body);
      if (['completed', 'cancelled'].includes(t.status)) throw conflict(`A ${t.status} training can no longer be edited`, 'TRAINING_LOCKED');
      const n = enrolledCount(t.id);
      if (input.capacity < n) throw conflict(`Capacity cannot be lower than the ${n} participants already enrolled`, 'CAPACITY_TOO_LOW');
      Object.assign(t, input);
      audit(user, 'training.update', 'training', t.id, t.title);
      return trainingDTO(t);
    }),
    remove: (id) => run(() => {
      const user = guard('admin');
      const d = load();
      const t = d.trainings.find((x) => x.id === Number(id));
      if (!t) throw notFound('Training');
      d.trainings = d.trainings.filter((x) => x.id !== t.id);
      d.participants = d.participants.filter((p) => p.trainingId !== t.id);
      audit(user, 'training.delete', 'training', t.id, t.title);
      return null;
    }),
    setStatus: (id, status) => run(() => {
      const user = guard(...WRITE);
      const t = load().trainings.find((x) => x.id === Number(id));
      if (!t) throw notFound('Training');
      if (!TRAINING_STATUSES.includes(status)) throw invalid([{ in: 'body', field: 'status', message: `Status must be one of: ${TRAINING_STATUSES.join(', ')}` }]);
      const allowed = TRAINING_TRANSITIONS[t.status];
      if (!allowed.includes(status)) {
        throw conflict(allowed.length ? `Cannot move a ${t.status} training to ${status}. Allowed: ${allowed.join(', ')}` : `A ${t.status} training cannot change status any more`, 'INVALID_TRANSITION');
      }
      const previous = t.status;
      t.status = status;
      audit(user, 'training.status', 'training', t.id, `${previous} -> ${status}`);
      return trainingDTO(t);
    }),
    addParticipant: (id, employeeId) => run(() => {
      const user = guard(...WRITE);
      const d = load();
      const t = d.trainings.find((x) => x.id === Number(id));
      if (!t) throw notFound('Training');
      if (!Number.isInteger(employeeId) || employeeId < 1) throw invalid([{ in: 'body', field: 'employeeId', message: 'employeeId must be a positive integer' }]);
      if (!ENROLLABLE_STATUSES.includes(t.status)) throw conflict(`Enrolment is closed: the training is ${t.status}`, 'TRAINING_CLOSED');
      const e = d.employees.find((x) => x.id === employeeId);
      if (!e) throw notFound('Employee');
      if (e.status !== 'active') throw conflict('Inactive employees cannot be enrolled', 'EMPLOYEE_INACTIVE');
      if (d.participants.some((p) => p.trainingId === t.id && p.employeeId === e.id)) throw conflict('Employee is already enrolled in this training', 'ALREADY_ENROLLED');
      if (enrolledCount(t.id) >= t.capacity) throw conflict(`This training is full (capacity ${t.capacity})`, 'CAPACITY_FULL');
      d.participants.push({ trainingId: t.id, employeeId: e.id, status: 'enrolled', enrolledAt: new Date().toISOString() });
      audit(user, 'participant.add', 'training', t.id, `${e.fullName} -> ${t.title}`);
      return trainingDetail(t.id);
    }),
    setParticipantStatus: (id, employeeId, status) => run(() => {
      const user = guard(...WRITE);
      const d = load();
      const t = d.trainings.find((x) => x.id === Number(id));
      const p = d.participants.find((x) => x.trainingId === Number(id) && x.employeeId === Number(employeeId));
      if (!t || !p) throw notFound('Participant');
      if (!PARTICIPANT_STATUSES.includes(status)) throw invalid([{ in: 'body', field: 'status', message: `Status must be one of: ${PARTICIPANT_STATUSES.join(', ')}` }]);
      if (!ATTENDANCE_STATUSES.includes(t.status)) throw conflict(`Attendance can only be recorded for trainings that are in progress or completed (this one is ${t.status})`, 'ATTENDANCE_NOT_ALLOWED');
      const e = d.employees.find((x) => x.id === p.employeeId);
      audit(user, 'participant.status', 'training', t.id, `${e.fullName}: ${p.status} -> ${status}`);
      p.status = status;
      return trainingDetail(t.id);
    }),
    removeParticipant: (id, employeeId) => run(() => {
      const user = guard(...WRITE);
      const d = load();
      const t = d.trainings.find((x) => x.id === Number(id));
      const p = d.participants.find((x) => x.trainingId === Number(id) && x.employeeId === Number(employeeId));
      if (!t || !p) throw notFound('Participant');
      if (!ENROLLABLE_STATUSES.includes(t.status)) throw conflict(`Participants cannot be removed from a ${t.status} training`, 'TRAINING_CLOSED');
      const e = d.employees.find((x) => x.id === p.employeeId);
      d.participants = d.participants.filter((x) => x !== p);
      audit(user, 'participant.remove', 'training', t.id, `${e.fullName} <- ${t.title}`);
      return trainingDetail(t.id);
    }),
  };

  api.audit = {
    list: (q = {}) => run(() => {
      guard('admin');
      const details = [];
      const paging = pageParams(q, details);
      if (details.length) throw invalid(details);
      const s = (q.search || '').trim().toLowerCase();
      const rows = load().audit
        .filter((a) => (!q.entity || a.entity === q.entity) && (!s || [a.username, a.action, a.details].some((f) => (f || '').toLowerCase().includes(s))))
        .sort((a, b) => b.id - a.id);
      return paginate(rows, paging);
    }),
  };

  return api;
}
