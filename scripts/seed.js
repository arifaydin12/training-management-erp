// Loads realistic, fictional demo data: 60 employees, 25 trainings, enrolments, audit entries
// and three demo accounts (admin, hr, viewer).
// Usage: npm run seed            (refuses to run if data already exists)
//        npm run seed -- --reset (wipes all tables first)
'use strict';

const bcrypt = require('bcryptjs');
const { loadConfig } = require('../src/config');
const db = require('../src/db/pool');

async function main() {
  const { generateSeed, DEMO_PASSWORD } = await import('../public/js/demo/seed-data.js');
  const reset = process.argv.includes('--reset');
  const config = loadConfig();

  const existing = await db.query('SELECT (SELECT COUNT(*) FROM dbo.employees) AS e, (SELECT COUNT(*) FROM dbo.trainings) AS t');
  const { e, t } = existing.recordset[0];
  if ((e || t) && !reset) {
    console.error(`The database already contains ${e} employees and ${t} trainings. Re-run with "-- --reset" to replace them.`);
    process.exitCode = 1;
    return;
  }

  const data = generateSeed();
  const hash = await bcrypt.hash(DEMO_PASSWORD, config.bcryptRounds);

  await db.transaction(async (run) => {
    if (reset) {
      await run('DELETE FROM dbo.training_participants');
      await run('DELETE FROM dbo.trainings');
      await run('DELETE FROM dbo.employees');
      await run('DELETE FROM dbo.audit_log');
      await run('DELETE FROM dbo.users');
    }

    for (const u of data.users) {
      await run(
        'INSERT INTO dbo.users (username, password_hash, full_name, role) VALUES (@username, @hash, @fullName, @role)',
        { ...u, hash },
      );
    }

    // Explicit ids keep participants/audit references stable.
    for (const x of data.employees) {
      await run(
        `SET IDENTITY_INSERT dbo.employees ON;
         INSERT INTO dbo.employees (id, employee_number, full_name, email, department, job_title, hire_date, status, created_at)
         VALUES (@id, @employeeNumber, @fullName, @email, @department, @jobTitle, CAST(@hireDate AS DATE), @status, CAST(@createdAt AS DATETIME2(0)));
         SET IDENTITY_INSERT dbo.employees OFF;`,
        x,
      );
    }

    for (const x of data.trainings) {
      await run(
        `SET IDENTITY_INSERT dbo.trainings ON;
         INSERT INTO dbo.trainings (id, title, description, category, trainer, location, start_date, end_date, capacity, budget, status, created_at)
         VALUES (@id, @title, @description, @category, @trainer, @location, CAST(@startDate AS DATE), CAST(@endDate AS DATE),
                 @capacity, @budget, @status, CAST(@createdAt AS DATETIME2(0)));
         SET IDENTITY_INSERT dbo.trainings OFF;`,
        x,
      );
    }

    for (const p of data.participants) {
      await run(
        `INSERT INTO dbo.training_participants (training_id, employee_id, status, enrolled_at)
         VALUES (@trainingId, @employeeId, @status, CAST(@enrolledAt AS DATETIME2(0)))`,
        p,
      );
    }

    for (const a of data.audit) {
      await run(
        `INSERT INTO dbo.audit_log (username, action, entity, entity_id, details, created_at)
         VALUES (@username, @action, @entity, @entityId, @details, CAST(@createdAt AS DATETIME2(0)))`,
        a,
      );
    }
  });

  console.log(
    `Seeded ${data.employees.length} employees, ${data.trainings.length} trainings, ${data.participants.length} enrolments, ${data.audit.length} audit entries.`,
  );
  console.log('Demo accounts (password for all three: see README "Demo accounts"):');
  for (const u of data.users) console.log(`  ${u.username.padEnd(8)} ${u.role}`);
}

main()
  .catch((err) => {
    console.error(`seed failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.close());
