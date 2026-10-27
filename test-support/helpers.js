'use strict';

// Shared helpers for the API integration tests. Every test file runs in its own process
// (node --test), so each file gets its own throw-away database on the real SQL Server:
//   <TEST_DB_NAME or TrainingErpTest>_<suite>
// Connection settings come from .env (DB_SERVER, DB_PORT, DB_USER, DB_PASSWORD).

const supertest = require('supertest');

const PASSWORD = 'Test-Password-1';
const SUITE_USERS = [
  { username: 'admin', fullName: 'Test Admin', role: 'admin' },
  { username: 'hr', fullName: 'Test HR Manager', role: 'hr_manager' },
  { username: 'viewer', fullName: 'Test Viewer', role: 'viewer' },
];

async function startTestApp(suite, appOptions = {}) {
  process.env.NODE_ENV = 'test';
  process.env.DB_NAME = `${process.env.TEST_DB_NAME || 'TrainingErpTest'}_${suite}`;
  process.env.JWT_SECRET = 'integration-test-secret-0123456789';

  const { loadConfig } = require('../src/config');
  const { createApp } = require('../src/app');
  const { dropDatabase, initDatabase } = require('../src/db/init');
  const users = require('../src/services/users.service');

  const config = loadConfig();
  await dropDatabase();
  await initDatabase();
  for (const u of SUITE_USERS) await users.create({ ...u, password: PASSWORD }, { rounds: 4 });

  const app = createApp(config, appOptions);
  const request = supertest(app);

  const tokens = {};
  for (const u of SUITE_USERS) {
    const res = await request.post('/api/auth/login').send({ username: u.username, password: PASSWORD });
    if (res.status !== 200) throw new Error(`Test login failed for ${u.username}: ${res.status}`);
    tokens[u.role === 'hr_manager' ? 'hr' : u.role] = res.body.token;
  }

  return { app, request, config, tokens };
}

async function stopTestApp() {
  const { dropDatabase } = require('../src/db/init');
  if (!process.env.KEEP_TEST_DB) await dropDatabase();
  await require('../src/db/pool').close();
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter += 1)}`;

const employeePayload = (overrides = {}) => {
  const n = unique();
  return {
    fullName: `Test Person ${n}`,
    email: `person.${n}@example.com`,
    department: 'Engineering',
    jobTitle: 'Software Engineer',
    hireDate: '2022-03-01',
    ...overrides,
  };
};

const day = (offset) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

const trainingPayload = (overrides = {}) => ({
  title: `Training ${unique()}`,
  description: 'Integration test training',
  category: 'Technical',
  trainer: 'Jane Trainer (Test Academy)',
  location: 'Warsaw HQ',
  startDate: day(10),
  endDate: day(11),
  capacity: 5,
  budget: 1500,
  ...overrides,
});

async function createEmployee(ctx, overrides = {}, token = ctx.tokens.hr) {
  const res = await ctx.request.post('/api/employees').set(bearer(token)).send(employeePayload(overrides));
  if (res.status !== 201) throw new Error(`createEmployee failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

async function createTraining(ctx, overrides = {}, token = ctx.tokens.hr) {
  const res = await ctx.request.post('/api/trainings').set(bearer(token)).send(trainingPayload(overrides));
  if (res.status !== 201) throw new Error(`createTraining failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

async function setStatus(ctx, trainingId, status, token = ctx.tokens.hr) {
  const res = await ctx.request.post(`/api/trainings/${trainingId}/status`).set(bearer(token)).send({ status });
  if (res.status !== 200) throw new Error(`setStatus failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

module.exports = {
  PASSWORD,
  startTestApp,
  stopTestApp,
  bearer,
  employeePayload,
  trainingPayload,
  createEmployee,
  createTraining,
  setStatus,
  day,
  unique,
};
