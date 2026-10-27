'use strict';

const db = require('../db/pool');

const MONTHS_BACK = 9; // the chart shows 12 months: 9 back, the current one and 2 ahead

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthWindow(now = new Date()) {
  const months = [];
  for (let i = -MONTHS_BACK; i <= 2; i += 1) {
    months.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1)));
  }
  return months;
}

async function getDashboard() {
  const months = monthWindow();
  const from = months[0].toISOString().slice(0, 10);
  const to = new Date(Date.UTC(months[11].getUTCFullYear(), months[11].getUTCMonth() + 1, 1)).toISOString().slice(0, 10);

  const [kpis, departments, statuses, upcoming, budget] = await Promise.all([
    db.query(`
      DECLARE @today DATE = CAST(SYSUTCDATETIME() AS DATE);
      SELECT
        (SELECT COUNT(*) FROM dbo.employees WHERE status = N'active') AS activeEmployees,
        (SELECT COUNT(*) FROM dbo.employees) AS totalEmployees,
        (SELECT COUNT(*) FROM dbo.trainings WHERE status = N'planned' AND start_date >= @today) AS upcomingTrainings,
        (SELECT COUNT(*) FROM dbo.trainings WHERE status = N'in_progress') AS inProgressTrainings,
        (SELECT COUNT(*) FROM dbo.trainings WHERE status = N'completed' AND YEAR(start_date) = YEAR(@today)) AS completedThisYear,
        (SELECT ISNULL(SUM(budget), 0) FROM dbo.trainings WHERE status <> N'cancelled' AND YEAR(start_date) = YEAR(@today)) AS budgetThisYear,
        (SELECT COUNT(*) FROM dbo.training_participants) AS totalEnrollments,
        (SELECT COUNT(*) FROM dbo.training_participants tp JOIN dbo.trainings t ON t.id = tp.training_id
           WHERE t.status = N'completed' AND tp.status = N'completed') AS completedParticipations,
        (SELECT COUNT(*) FROM dbo.training_participants tp JOIN dbo.trainings t ON t.id = tp.training_id
           WHERE t.status = N'completed') AS finishedParticipations`),
    db.query(`SELECT department, COUNT(*) AS count FROM dbo.employees
              WHERE status = N'active' GROUP BY department ORDER BY COUNT(*) DESC, department`),
    db.query(`SELECT status, COUNT(*) AS count FROM dbo.trainings GROUP BY status`),
    db.query(`
      SELECT TOP (6) t.id, t.title, t.category, t.trainer,
             CONVERT(varchar(10), t.start_date, 23) AS startDate,
             CONVERT(varchar(10), t.end_date, 23) AS endDate,
             t.status, t.capacity,
             (SELECT COUNT(*) FROM dbo.training_participants tp WHERE tp.training_id = t.id) AS enrolledCount
      FROM dbo.trainings t
      WHERE t.status IN (N'planned', N'in_progress') AND t.end_date >= CAST(SYSUTCDATETIME() AS DATE)
      ORDER BY t.start_date, t.id`),
    db.query(
      `SELECT CONVERT(char(7), start_date, 126) AS month, SUM(budget) AS budget, COUNT(*) AS trainings
       FROM dbo.trainings
       WHERE status <> N'cancelled' AND start_date >= CAST(@from AS DATE) AND start_date < CAST(@to AS DATE)
       GROUP BY CONVERT(char(7), start_date, 126)`,
      { from, to },
    ),
  ]);

  const k = kpis.recordset[0];
  const byMonth = new Map(budget.recordset.map((r) => [r.month, r]));

  return {
    kpis: {
      activeEmployees: k.activeEmployees,
      totalEmployees: k.totalEmployees,
      upcomingTrainings: k.upcomingTrainings,
      inProgressTrainings: k.inProgressTrainings,
      completedThisYear: k.completedThisYear,
      budgetThisYear: Number(k.budgetThisYear),
      totalEnrollments: k.totalEnrollments,
      completionRate: k.finishedParticipations
        ? Math.round((k.completedParticipations / k.finishedParticipations) * 100)
        : 0,
    },
    departmentDistribution: departments.recordset,
    trainingsByStatus: statuses.recordset,
    upcomingTrainings: upcoming.recordset,
    budgetByMonth: months.map((m) => {
      const row = byMonth.get(monthKey(m));
      return { month: monthKey(m), budget: row ? Number(row.budget) : 0, trainings: row ? row.trainings : 0 };
    }),
  };
}

module.exports = { getDashboard };
