'use strict';

const ROLES = Object.freeze(['admin', 'hr_manager', 'viewer']);
const EMPLOYEE_STATUSES = Object.freeze(['active', 'inactive']);
const TRAINING_STATUSES = Object.freeze(['planned', 'in_progress', 'completed', 'cancelled']);
const PARTICIPANT_STATUSES = Object.freeze(['enrolled', 'attended', 'completed', 'absent']);

const DEPARTMENTS = Object.freeze([
  'Engineering',
  'Sales',
  'Marketing',
  'Finance',
  'Human Resources',
  'Operations',
  'Customer Support',
  'Legal',
]);

const TRAINING_CATEGORIES = Object.freeze([
  'Technical',
  'Leadership',
  'Compliance',
  'Soft Skills',
  'Safety',
  'Sales',
  'Languages',
]);

/** Allowed status workflow for a training. */
const TRAINING_TRANSITIONS = Object.freeze({
  planned: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
});

/** Trainings in these states accept new enrolments. */
const ENROLLABLE_STATUSES = Object.freeze(['planned', 'in_progress']);
/** Attendance can only be recorded once a training has started. */
const ATTENDANCE_STATUSES = Object.freeze(['in_progress', 'completed']);

module.exports = {
  ROLES,
  EMPLOYEE_STATUSES,
  TRAINING_STATUSES,
  PARTICIPANT_STATUSES,
  DEPARTMENTS,
  TRAINING_CATEGORIES,
  TRAINING_TRANSITIONS,
  ENROLLABLE_STATUSES,
  ATTENDANCE_STATUSES,
};
