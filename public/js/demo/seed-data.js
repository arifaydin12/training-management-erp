// Deterministic, fictional demo data. It is used by `npm run seed` (SQL Server) and by
// the in-browser demo API, so both show exactly the same company. Dates are generated
// relative to "today" so the dashboard always has upcoming and past trainings.

export const DEMO_PASSWORD = 'Demo-Pass-2026';

export const DEMO_USERS = [
  { username: 'admin', fullName: 'Maria Schneider', role: 'admin' },
  { username: 'hr', fullName: 'Tomasz Wisniewski', role: 'hr_manager' },
  { username: 'viewer', fullName: 'Elena Rossi', role: 'viewer' },
];

const FIRST_NAMES = [
  'Anna', 'Lukas', 'Marta', 'Jonas', 'Elena', 'Sofia', 'Daniel', 'Amira', 'Piotr', 'Clara',
  'Felix', 'Nina', 'Marek', 'Hannah', 'Oskar', 'Laura', 'Pawel', 'Greta', 'Viktor', 'Julia',
  'Adam', 'Emma', 'Stefan', 'Zofia', 'Leon', 'Katarina', 'Mateusz', 'Ingrid', 'Samuel', 'Olivia',
];

const LAST_NAMES = [
  'Kowalski', 'Becker', 'Nowak', 'Schneider', 'Rossi', 'Martinez', 'Novak', 'Haddad', 'Wojcik', 'Fischer',
  'Lindqvist', 'Kaminski', 'Weber', 'Dubois', 'Zielinski', 'Hoffmann', 'Petrov', 'Meyer', 'Lewandowski', 'Costa',
  'Wagner', 'Jankowski', 'Berg', 'Mazur', 'Keller', 'Silva', 'Krawczyk', 'Brandt', 'Olsen', 'Pawlak',
];

const DEPARTMENTS = [
  ['Engineering', 18],
  ['Sales', 9],
  ['Marketing', 6],
  ['Finance', 6],
  ['Human Resources', 4],
  ['Operations', 8],
  ['Customer Support', 6],
  ['Legal', 3],
];

const JOB_TITLES = {
  Engineering: ['Software Engineer', 'Senior Software Engineer', 'QA Engineer', 'DevOps Engineer', 'Engineering Manager'],
  Sales: ['Account Executive', 'Sales Representative', 'Sales Manager', 'Business Development Manager'],
  Marketing: ['Marketing Specialist', 'Content Manager', 'Brand Manager', 'Growth Analyst'],
  Finance: ['Financial Analyst', 'Accountant', 'Controller', 'Payroll Specialist'],
  'Human Resources': ['HR Business Partner', 'Recruiter', 'Learning & Development Specialist'],
  Operations: ['Operations Coordinator', 'Logistics Planner', 'Process Analyst', 'Operations Manager'],
  'Customer Support': ['Support Agent', 'Senior Support Agent', 'Support Team Lead', 'Customer Success Manager'],
  Legal: ['Legal Counsel', 'Compliance Officer', 'Paralegal'],
};

// [title, category, trainer, location, startOffsetDays, durationDays, capacity, budget, status]
const TRAININGS = [
  ['Secure Coding Fundamentals', 'Technical', 'Katarzyna Lis (Spree Academy)', 'Berlin Office', -281, 2, 16, 3200, 'completed'],
  ['Leadership Essentials', 'Leadership', 'Andreas Vogel (Kreuzberg Learning)', 'Warsaw HQ - Room A', -241, 3, 14, 5400, 'completed'],
  ['GDPR & Data Protection Basics', 'Compliance', 'Joanna Frank (Oder Consulting)', 'Online (video call)', -218, 1, 30, 1200, 'completed'],
  ['Workplace Safety Refresher', 'Safety', 'Marek Bielak (Praga Skills Lab)', 'Warsaw HQ - Room B', -196, 1, 25, 900, 'completed'],
  ['Business English B2', 'Languages', 'Helen Carter (Tiergarten Institute)', 'Online (video call)', -183, 10, 12, 4800, 'completed'],
  ['Consultative Selling Workshop', 'Sales', 'Lukas Brandt (Spree Academy)', 'Berlin Office', -161, 2, 18, 3900, 'completed'],
  ['Advanced Excel for Finance', 'Technical', 'Ewa Maj (Mokotow Partners)', 'Warsaw HQ - Room A', -140, 2, 15, 2100, 'completed'],
  ['Giving and Receiving Feedback', 'Soft Skills', 'Sandra Keller (Kreuzberg Learning)', 'Wroclaw Hub', -118, 1, 20, 1500, 'completed'],
  ['Anti-Corruption & Ethics', 'Compliance', 'Joanna Frank (Oder Consulting)', 'Online (video call)', -97, 1, 40, 1400, 'completed'],
  ['Cloud Architecture on a Budget', 'Technical', 'Piotr Zawadzki (Praga Skills Lab)', 'Gdansk Training Center', -75, 3, 14, 4200, 'completed'],
  ['Conflict Resolution at Work', 'Soft Skills', 'Sandra Keller (Kreuzberg Learning)', 'Warsaw HQ - Room B', -52, 1, 18, 1300, 'completed'],
  ['First Aid Certification', 'Safety', 'Natalia Pruss (Mokotow Partners)', 'Warsaw HQ - Room A', -31, 1, 20, 1100, 'completed'],
  ['Product Launch Playbook', 'Sales', 'Lukas Brandt (Spree Academy)', 'Berlin Office', -22, 1, 16, 1800, 'cancelled'],
  ['Remote Team Management', 'Leadership', 'Andreas Vogel (Kreuzberg Learning)', 'Online (video call)', -9, 2, 14, 2600, 'completed'],
  ['Data Analysis with SQL', 'Technical', 'Piotr Zawadzki (Praga Skills Lab)', 'Warsaw HQ - Room A', -2, 4, 15, 3000, 'in_progress'],
  ['Customer Communication Skills', 'Soft Skills', 'Helen Carter (Tiergarten Institute)', 'Wroclaw Hub', -1, 3, 16, 2200, 'in_progress'],
  ['Fire Safety & Evacuation Drill', 'Safety', 'Marek Bielak (Praga Skills Lab)', 'Warsaw HQ - Room B', 6, 1, 30, 800, 'planned'],
  ['Negotiation Masterclass', 'Sales', 'Lukas Brandt (Spree Academy)', 'Berlin Office', 11, 2, 12, 3600, 'planned'],
  ['Kubernetes in Practice', 'Technical', 'Piotr Zawadzki (Praga Skills Lab)', 'Gdansk Training Center', 18, 3, 12, 4800, 'planned'],
  ['German for Business Travel', 'Languages', 'Katja Neumann (Tiergarten Institute)', 'Online (video call)', 25, 8, 10, 3400, 'planned'],
  ['Coaching Skills for Managers', 'Leadership', 'Andreas Vogel (Kreuzberg Learning)', 'Warsaw HQ - Room A', 34, 2, 12, 3100, 'planned'],
  ['Information Security Awareness', 'Compliance', 'Joanna Frank (Oder Consulting)', 'Online (video call)', 45, 1, 12, 1000, 'planned'],
  ['Presentation & Storytelling', 'Soft Skills', 'Sandra Keller (Kreuzberg Learning)', 'Berlin Office', 63, 2, 18, 1900, 'planned'],
  ['Financial Modelling Bootcamp', 'Technical', 'Ewa Maj (Mokotow Partners)', 'Warsaw HQ - Room B', 82, 3, 14, 3800, 'planned'],
  ['Strategic Account Planning', 'Sales', 'Lukas Brandt (Spree Academy)', 'Munich Office', 101, 2, 16, 2900, 'planned'],
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const minDate = (a, b) => (a < b ? a : b);

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Returns { users, employees, trainings, participants, audit } with numeric ids
 * starting at 1, ready to be inserted into a database or kept in memory.
 */
export function generateSeed(today = todayISO()) {
  const rand = mulberry32(20260101);
  const pick = (list) => list[Math.floor(rand() * list.length)];

  // ---- employees ---------------------------------------------------------
  const departmentPool = DEPARTMENTS.flatMap(([name, weight]) => Array(weight).fill(name));
  const used = new Set();
  const employees = [];
  for (let i = 0; i < 60; i += 1) {
    let first;
    let last;
    do {
      first = pick(FIRST_NAMES);
      last = pick(LAST_NAMES);
    } while (used.has(`${first} ${last}`));
    used.add(`${first} ${last}`);

    const department = departmentPool[i % departmentPool.length];
    const hire = addDays(today, -Math.floor(120 + rand() * 3300));
    employees.push({
      id: i + 1,
      employeeNumber: `EMP-${String(i + 1).padStart(4, '0')}`,
      fullName: `${first} ${last}`,
      email: `${first}.${last}@vistulaworks.example`.toLowerCase(),
      department,
      jobTitle: pick(JOB_TITLES[department]),
      hireDate: hire,
      status: rand() < 0.07 ? 'inactive' : 'active',
      createdAt: `${addDays(today, -300)}T09:00:00.000Z`,
    });
  }
  // Shuffle so departments are not visibly grouped by id.
  for (let i = employees.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [employees[i].department, employees[j].department] = [employees[j].department, employees[i].department];
    [employees[i].jobTitle, employees[j].jobTitle] = [employees[j].jobTitle, employees[i].jobTitle];
  }
  employees.sort((a, b) => a.id - b.id);

  // ---- trainings ---------------------------------------------------------
  const trainings = TRAININGS.map((t, i) => {
    const [title, category, trainer, location, offset, days, capacity, budget, status] = t;
    const startDate = addDays(today, offset);
    return {
      id: i + 1,
      title,
      description: `${title}: a practical session delivered by ${trainer.split(' (')[0]}.`,
      category,
      trainer,
      location,
      startDate,
      endDate: addDays(startDate, days - 1),
      capacity,
      budget,
      status,
      createdAt: `${minDate(addDays(startDate, -35), addDays(today, -2 - (i % 9)))}T10:00:00.000Z`,
    };
  });

  // ---- participants ------------------------------------------------------
  const active = employees.filter((e) => e.status === 'active');
  const participants = [];
  for (const t of trainings) {
    const fill = { completed: [0.6, 0.95], in_progress: [0.75, 1], planned: [0.2, 0.85], cancelled: [0.2, 0.5] }[t.status];
    let count = Math.round(t.capacity * (fill[0] + rand() * (fill[1] - fill[0])));
    if (t.title === 'Information Security Awareness') count = t.capacity; // one full session for the demo
    count = Math.min(count, t.capacity, active.length);

    const pool = [...active];
    for (let i = 0; i < count; i += 1) {
      const e = pool.splice(Math.floor(rand() * pool.length), 1)[0];
      let status = 'enrolled';
      const r = rand();
      if (t.status === 'completed') status = r < 0.82 ? 'completed' : r < 0.9 ? 'attended' : 'absent';
      else if (t.status === 'in_progress') status = r < 0.6 ? 'attended' : 'enrolled';
      participants.push({
        trainingId: t.id,
        employeeId: e.id,
        status,
        enrolledAt: `${minDate(addDays(t.startDate, -Math.floor(7 + rand() * 20)), addDays(today, -1))}T12:00:00.000Z`,
      });
    }
  }

  // ---- audit trail -------------------------------------------------------
  const audit = [];
  const hr = DEMO_USERS[1];
  const admin = DEMO_USERS[0];
  employees.slice(0, 12).forEach((e) => {
    audit.push({ username: hr.username, action: 'employee.create', entity: 'employee', entityId: e.id, details: e.fullName, createdAt: `${addDays(today, -300)}T09:${String(10 + e.id).padStart(2, '0')}:00.000Z` });
  });
  trainings.forEach((t) => {
    audit.push({ username: hr.username, action: 'training.create', entity: 'training', entityId: t.id, details: t.title, createdAt: `${t.createdAt.slice(0, 10)}T10:15:00.000Z` });
    if (t.status === 'completed' || t.status === 'in_progress') {
      audit.push({ username: hr.username, action: 'training.status', entity: 'training', entityId: t.id, details: 'planned -> in_progress', createdAt: `${t.startDate}T07:50:00.000Z` });
    }
    if (t.status === 'completed') {
      audit.push({ username: hr.username, action: 'training.status', entity: 'training', entityId: t.id, details: 'in_progress -> completed', createdAt: `${t.endDate}T17:30:00.000Z` });
    }
    if (t.status === 'cancelled') {
      audit.push({ username: admin.username, action: 'training.status', entity: 'training', entityId: t.id, details: 'planned -> cancelled', createdAt: `${addDays(t.startDate, -4)}T11:05:00.000Z` });
    }
  });
  audit.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  audit.forEach((a, i) => { a.id = i + 1; });

  return { users: DEMO_USERS, employees, trainings, participants, audit };
}
