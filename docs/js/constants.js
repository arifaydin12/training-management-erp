// Reference data. The server exposes the same lists at GET /api/meta; the demo API reuses these.
export const ROLES = ['admin', 'hr_manager', 'viewer'];
export const EMPLOYEE_STATUSES = ['active', 'inactive'];
export const TRAINING_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'];
export const PARTICIPANT_STATUSES = ['enrolled', 'attended', 'completed', 'absent'];

export const DEPARTMENTS = [
  'Engineering', 'Sales', 'Marketing', 'Finance', 'Human Resources', 'Operations', 'Customer Support', 'Legal',
];

export const TRAINING_CATEGORIES = ['Technical', 'Leadership', 'Compliance', 'Soft Skills', 'Safety', 'Sales', 'Languages'];

export const TRAINING_TRANSITIONS = {
  planned: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export const ENROLLABLE_STATUSES = ['planned', 'in_progress'];
export const ATTENDANCE_STATUSES = ['in_progress', 'completed'];

export const META = {
  roles: ROLES,
  departments: DEPARTMENTS,
  categories: TRAINING_CATEGORIES,
  employeeStatuses: EMPLOYEE_STATUSES,
  trainingStatuses: TRAINING_STATUSES,
  participantStatuses: PARTICIPANT_STATUSES,
  trainingTransitions: TRAINING_TRANSITIONS,
};

/** What each role may do. Mirrors the authorisation rules of the REST API. */
export const can = {
  write: (user) => ['admin', 'hr_manager'].includes(user?.role),
  delete: (user) => user?.role === 'admin',
  audit: (user) => user?.role === 'admin',
};
