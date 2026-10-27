'use strict';

const { z } = require('zod');
const {
  ROLES,
  EMPLOYEE_STATUSES,
  TRAINING_STATUSES,
  PARTICIPANT_STATUSES,
  DEPARTMENTS,
  TRAINING_CATEGORIES,
} = require('../constants');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Required, trimmed string with friendly messages. */
const text = (label, { min = 1, max = 100 } = {}) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(min, min === 1 ? `${label} is required` : `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

const optionalText = (label, max) =>
  z
    .string({ error: `${label} must be text` })
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .nullish()
    .transform((v) => (v ? v : null));

const oneOf = (label, values) =>
  z.enum(values, { error: `${label} must be one of: ${values.join(', ')}` });

const isoDate = (label) =>
  z
    .string({ error: `${label} is required` })
    .refine((v) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    }, `${label} must be a valid date in YYYY-MM-DD format`);

const email = z
  .string({ error: 'Email is required' })
  .trim()
  .toLowerCase()
  .max(120, 'Email must be at most 120 characters')
  .regex(EMAIL_RE, 'Email must be a valid address');

const id = z.coerce
  .number({ error: 'Id must be a positive integer' })
  .int('Id must be a positive integer')
  .min(1, 'Id must be a positive integer');

const pagination = {
  page: z.coerce.number().int().min(1, 'page must be at least 1').default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1, 'pageSize must be at least 1')
    .max(100, 'pageSize must be at most 100')
    .default(10),
};

const filterText = z.string().trim().max(100).optional();
const sortOrder = z.enum(['asc', 'desc']).default('asc');

// ---------------------------------------------------------------- auth
const login = z.object({
  username: text('Username', { max: 50 }),
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required').max(200),
});

// ---------------------------------------------------------------- users
const createUser = z.object({
  username: text('Username', { min: 3, max: 50 }).regex(
    /^[a-zA-Z0-9._-]+$/,
    'Username may contain letters, digits, dots, dashes and underscores only',
  ),
  fullName: text('Full name'),
  password: z
    .string({ error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password must be at most 100 characters'),
  role: oneOf('Role', ROLES),
});

// ---------------------------------------------------------------- employees
const employeeBody = z.object({
  employeeNumber: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{3,20}$/, 'Employee number must be 3-20 letters, digits or dashes')
    .optional(),
  fullName: text('Full name'),
  email,
  department: oneOf('Department', DEPARTMENTS),
  jobTitle: text('Job title', { max: 80 }),
  hireDate: isoDate('Hire date').nullish().transform((v) => v || null),
  status: oneOf('Status', EMPLOYEE_STATUSES).default('active'),
});

const employeeQuery = z.object({
  ...pagination,
  search: filterText,
  department: filterText,
  status: filterText,
  sort: z.enum(['fullName', 'department', 'jobTitle', 'hireDate', 'employeeNumber', 'status']).default('fullName'),
  order: sortOrder,
});

const employeeExportQuery = employeeQuery.omit({ page: true, pageSize: true });

// ---------------------------------------------------------------- trainings
const trainingBase = z.object({
  title: text('Title', { max: 150 }),
  description: optionalText('Description', 1000),
  category: oneOf('Category', TRAINING_CATEGORIES),
  trainer: text('Trainer', { max: 100 }),
  location: optionalText('Location', 100),
  startDate: isoDate('Start date'),
  endDate: isoDate('End date'),
  capacity: z
    .number({ error: 'Capacity must be a whole number' })
    .int('Capacity must be a whole number')
    .min(1, 'Capacity must be at least 1')
    .max(1000, 'Capacity must be at most 1000'),
  budget: z
    .number({ error: 'Budget must be a number' })
    .min(0, 'Budget cannot be negative')
    .max(10_000_000, 'Budget is too large')
    .default(0),
});

const trainingBody = trainingBase.refine((t) => t.endDate >= t.startDate, {
  path: ['endDate'],
  message: 'End date cannot be before the start date',
});

const trainingQuery = z.object({
  ...pagination,
  search: filterText,
  status: filterText,
  category: filterText,
  sort: z.enum(['title', 'startDate', 'category', 'status', 'capacity', 'budget']).default('startDate'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

const trainingStatus = z.object({ status: oneOf('Status', TRAINING_STATUSES) });

// ---------------------------------------------------------------- participants
const addParticipant = z.object({
  employeeId: z
    .number({ error: 'employeeId must be a positive integer' })
    .int('employeeId must be a positive integer')
    .min(1, 'employeeId must be a positive integer'),
});

const participantStatus = z.object({ status: oneOf('Status', PARTICIPANT_STATUSES) });

// ---------------------------------------------------------------- misc
const auditQuery = z.object({
  ...pagination,
  entity: filterText,
  search: filterText,
});

const params = {
  id: z.object({ id }),
  trainingEmployee: z.object({ id, employeeId: id }),
};

module.exports = {
  login,
  createUser,
  employeeBody,
  employeeQuery,
  employeeExportQuery,
  trainingBody,
  trainingQuery,
  trainingStatus,
  addParticipant,
  participantStatus,
  auditQuery,
  params,
};
