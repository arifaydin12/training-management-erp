import { h, debounce } from '../util/dom.js';
import { icon } from '../util/icons.js';
import { formatDate } from '../util/format.js';
import { downloadBlob } from '../util/csv.js';
import { can, DEPARTMENTS, EMPLOYEE_STATUSES } from '../constants.js';
import { toast } from '../ui/toast.js';
import { formModal, confirmDialog } from '../ui/modal.js';
import { pageHeader, button, badge, avatar, pager, sortHeader, emptyState, errorState, loadingRows } from '../ui/components.js';
import { label } from '../util/format.js';

export const employeeFields = (isEdit) => [
  [
    { name: 'fullName', label: 'Full name', required: true, maxlength: 100, autocomplete: 'off' },
    { name: 'email', label: 'Email', type: 'email', required: true, maxlength: 120 },
  ],
  [
    { name: 'department', label: 'Department', type: 'select', required: true, placeholder: 'Select department', options: DEPARTMENTS.map((d) => ({ value: d, label: d })) },
    { name: 'jobTitle', label: 'Job title', required: true, maxlength: 80 },
  ],
  [
    { name: 'employeeNumber', label: 'Employee number', maxlength: 20, hint: isEdit ? undefined : 'Leave empty to generate one' },
    { name: 'hireDate', label: 'Hire date', type: 'date', emptyAs: null },
  ],
  { name: 'status', label: 'Status', type: 'select', required: true, defaultValue: 'active', options: EMPLOYEE_STATUSES.map((s) => ({ value: s, label: label(s) })) },
];

export async function openEmployeeForm(api, employee) {
  const isEdit = Boolean(employee);
  return formModal({
    title: isEdit ? `Edit ${employee.fullName}` : 'Add employee',
    fields: employeeFields(isEdit),
    initial: employee || {},
    submitLabel: isEdit ? 'Save changes' : 'Add employee',
    wide: true,
    onSubmit: (values) => {
      const body = { ...values };
      if (!body.employeeNumber) delete body.employeeNumber;
      return isEdit ? api.employees.update(employee.id, body) : api.employees.create(body);
    },
  });
}

export function mountEmployees(root, ctx) {
  const canWrite = can.write(ctx.user);
  const canDelete = can.delete(ctx.user);
  const state = { search: '', department: '', status: '', sort: { key: 'fullName', order: 'asc' }, page: 1, pageSize: 10 };
  let requestId = 0;

  const searchInput = h('input', { class: 'input', type: 'search', id: 'emp-search', placeholder: 'Search by name, email, title or number', 'aria-label': 'Search employees', autocomplete: 'off' });
  const deptSelect = h('select', { class: 'select', 'aria-label': 'Filter by department' }, h('option', { value: '' }, 'All departments'), DEPARTMENTS.map((d) => h('option', { value: d }, d)));
  const statusSelect = h('select', { class: 'select', 'aria-label': 'Filter by status' }, h('option', { value: '' }, 'All statuses'), EMPLOYEE_STATUSES.map((s) => h('option', { value: s }, label(s))));

  const results = h('div', { 'aria-live': 'polite' });
  const footer = h('div');

  const applyFilters = () => { state.page = 1; load(); };
  searchInput.addEventListener('input', debounce(() => { state.search = searchInput.value.trim(); applyFilters(); }, 250));
  deptSelect.addEventListener('change', () => { state.department = deptSelect.value; applyFilters(); });
  statusSelect.addEventListener('change', () => { state.status = statusSelect.value; applyFilters(); });

  const query = () => ({ search: state.search, department: state.department, status: state.status, sort: state.sort.key, order: state.sort.order });

  const exportBtn = button({
    text: 'Export CSV', iconName: 'download',
    onClick: async () => {
      exportBtn.disabled = true;
      try {
        const { blob, filename } = await ctx.api.employees.exportCsv(query());
        downloadBlob(blob, filename);
        toast.success('Employee list exported');
      } catch (err) { toast.error(err.message); } finally { exportBtn.disabled = false; }
    },
  });

  root.append(
    pageHeader({
      title: 'Employees',
      subtitle: 'Search, filter and manage everyone who can attend trainings.',
      actions: [exportBtn, canWrite && button({ text: 'Add employee', iconName: 'userPlus', variant: 'primary', onClick: async () => { if (await openEmployeeForm(ctx.api)) { toast.success('Employee added'); load(); } } })],
    }),
    h('section', { class: 'card', 'aria-label': 'Employee list' },
      h('div', { class: 'toolbar', role: 'search' }, h('div', { class: 'search grow' }, icon('search'), searchInput), deptSelect, statusSelect),
      results, footer));

  function onSort(key) {
    state.sort = { key, order: state.sort.key === key && state.sort.order === 'asc' ? 'desc' : 'asc' };
    state.page = 1;
    load();
  }

  function renderTable(res) {
    if (!res.data.length) {
      const filtered = state.search || state.department || state.status;
      results.replaceChildren(emptyState({
        iconName: 'users',
        title: filtered ? 'No employees match your filters' : 'No employees yet',
        text: filtered ? 'Try a different search term or clear the filters.' : 'Add your first employee to start planning trainings.',
        action: filtered ? button({ text: 'Clear filters', onClick: () => { searchInput.value = ''; deptSelect.value = ''; statusSelect.value = ''; Object.assign(state, { search: '', department: '', status: '' }); applyFilters(); } }) : null,
      }));
      footer.replaceChildren();
      return;
    }

    const table = h('table', { class: 'data' },
      h('caption', { class: 'sr-only' }, `Employees, page ${res.meta.page} of ${res.meta.totalPages}`),
      h('thead', null, h('tr', null,
        sortHeader('Employee', 'fullName', state.sort, onSort),
        h('th', { scope: 'col', class: 'hide-md' }, 'Number'),
        sortHeader('Department', 'department', state.sort, onSort),
        h('th', { scope: 'col', class: 'hide-md' }, 'Job title'),
        sortHeader('Hired', 'hireDate', state.sort, onSort, 'hide-md'),
        h('th', { scope: 'col' }, 'Status'),
        h('th', { scope: 'col', class: 'right' }, 'Trainings'),
        h('th', { scope: 'col', class: 'actions' }, h('span', { class: 'sr-only' }, 'Actions')))),
      h('tbody', null, res.data.map((e) => h('tr', null,
        h('td', null, h('div', { class: 'cell-person' }, avatar(e.fullName), h('div', null, h('a', { class: 'row-link', href: `#/employees/${e.id}` }, e.fullName), h('small', null, e.email)))),
        h('td', { class: 'hide-md nowrap' }, e.employeeNumber),
        h('td', null, e.department),
        h('td', { class: 'hide-md' }, e.jobTitle),
        h('td', { class: 'hide-md nowrap' }, formatDate(e.hireDate)),
        h('td', null, badge(e.status)),
        h('td', { class: 'right' }, String(e.trainingCount)),
        h('td', { class: 'actions' },
          canWrite && button({ iconName: 'edit', variant: 'ghost', size: 'sm', ariaLabel: `Edit ${e.fullName}`, title: 'Edit', onClick: async () => { if (await openEmployeeForm(ctx.api, e)) { toast.success('Employee updated'); load(); } } }),
          canDelete && button({ iconName: 'trash', variant: 'ghost', size: 'sm', ariaLabel: `Delete ${e.fullName}`, title: 'Delete', onClick: () => remove(e) }))))));

    results.replaceChildren(h('div', { class: 'table-wrap' }, table));
    footer.replaceChildren(pager(res.meta, (p) => { state.page = p; load(); }, 'employees'));
  }

  async function remove(e) {
    const ok = await confirmDialog({
      title: 'Delete employee?',
      message: `${e.fullName} and ${e.trainingCount ? `their ${e.trainingCount} enrolment(s)` : 'all related records'} will be permanently removed. This cannot be undone.`,
      confirmLabel: 'Delete employee',
      danger: true,
    });
    if (!ok) return;
    try {
      await ctx.api.employees.remove(e.id);
      toast.success(`${e.fullName} was deleted`);
      load();
    } catch (err) { toast.error(err.message); }
  }

  async function load() {
    const id = (requestId += 1);
    results.replaceChildren(loadingRows(8, 5));
    try {
      const res = await ctx.api.employees.list({ ...query(), page: state.page, pageSize: state.pageSize });
      if (id !== requestId || !ctx.isActive()) return;
      renderTable(res);
    } catch (err) {
      if (id !== requestId || !ctx.isActive()) return;
      results.replaceChildren(errorState(err, load));
      footer.replaceChildren();
    }
  }

  load();
  return () => { requestId += 1; };
}
