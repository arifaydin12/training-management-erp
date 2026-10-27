// Creates an application user with a bcrypt-hashed password.
// Usage: npm run create-admin -- <username> "<Full Name>" "<password>" [admin|hr_manager|viewer]
'use strict';

const { loadConfig } = require('../src/config');
const db = require('../src/db/pool');
const users = require('../src/services/users.service');
const { createUser } = require('../src/validation/schemas');

(async () => {
  const [username, fullName, password, role = 'admin'] = process.argv.slice(2);
  if (!username || !fullName || !password) {
    console.error('Usage: npm run create-admin -- <username> "<Full Name>" "<password>" [admin|hr_manager|viewer]');
    process.exitCode = 1;
    return;
  }

  const parsed = createUser.safeParse({ username, fullName, password, role });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) console.error(`- ${issue.path.join('.')}: ${issue.message}`);
    process.exitCode = 1;
    return;
  }

  const created = await users.create(parsed.data, { rounds: loadConfig().bcryptRounds });
  console.log(`User created: ${created.username} (${created.role})`);
})()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => db.close());
