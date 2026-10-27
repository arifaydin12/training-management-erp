import { h, debounce } from '../util/dom.js';
import { icon } from '../util/icons.js';
import { dateRange, formatMoney, label } from '../util/format.js';
import { can, TRAINING_CATEGORIES, TRAINING_STATUSES } from '../constants.js';
import { toast } from '../ui/toast.js';
import { formModal, confirmDialog } from '../ui/modal.js';
import { pageHeader, button, badge, meter, pager, sortHeader, emptyState, errorState, loadingRows } from '../ui/components.js';

export const trainingFields = [
  { name: 'title', label: 'Title', required: true, maxlength: 150 },
  [
    { name: 'category', label: 'Category', type: 'select', required: true, placeholder: 'Select category', options: TRAINING_CATEGORIES.map((c) => ({ value: c, label: c })) },
    { name: 'trainer', label: 'Trainer', required: true, maxlength: 100, hint: 'Name and provider' },
  ],
  [
    { name: 'startDate', label: 'Start date', type: 'date', required: true },
    { name: 'endDate', label: 'End date', type: 'date', required: true },
  ],
  [
    { name: 'capacity', label: 'Capacity', type: 'number', required: true, min: 1, max: 1000, step: 1, hint: 'Maximum number of participants' },
    { name: 'budget', label: 'Budget (EUR)', type: 'number', min: 0, step: 50, defaultValue: 0 },
  ],
  { name: 'location', label: 'Location', maxlength: 100, emptyAs: null },
  { name: 'description', label: 'Description', type: 'textarea', maxlength: 1000, emptyAs: null },
];

export function openTrainingForm(api, training) {
  const isEdit = Boolean(training);
  return formModal({
    title: isEdit ? `Edit ${training.title}` : 'Plan a training',
    fields: trainingFields,
    initial: training || {},
    submitLabel: isEdit ? 'Save changes' : 'Create training',
    wide: true,
    onSubmit: (values) => (isEdit ? api.trainings.update(training.id, values) : api.trainings.create(values)),
  });
}

export function mountTrainings(root, ctx) {
  const canWrite = can.write(ctx.user);
  const canDelete = can.delete(ctx.user);
  const state = { search: '', status: '', category: '', sort: { key: 'startDate', order: 'desc' }, page: 1, pageSize: 10 };
  let requestId = 0;

  const searchInput = h('input', { class: 'input', type: 'search', placeholder: 'Search by title, trainer or location', 'aria-label': 'Search trainings', autocomplete: 'off' });
  const statusSelect = h('select', { class: 'select', 'aria-label': 'Filter by status' }, h('option', { value: '' }, 'All statuses'), TRAINING_STATUSES.map((s) => h('option', { value: s }, label(s))));
  const categorySelect = h('select', { class: 'select', 'aria-label': 'Filter by category' }, h('option', { value: '' }, 'All categories'), TRAINING_CATEGORIES.map((c) => h('option', { value: c }, c)));

  const results = h('div', { 'aria-live': 'polite' });
  const footer = h('div');

  const apply = () => { state.page = 1; load(); };
  searchInput.addEventListener('input', debounce(() => { state.search = searchInput.value.trim(); apply(); }, 250));
  statusSelect.addEventListener('change', () => { state.status = statusSelect.value; apply(); });
  categorySelect.addEventListener('change', () => { state.category = categorySelect.value; apply(); });

  root.append(
    pageHeader({
      title: 'Trainings',
      subtitle: 'Plan sessions, track capacity and follow each training through its lifecycle.',
      actions: canWrite && button({ text: 'Plan training', iconName: 'plus', variant: 'primary', onClick: async () => { const t = await openTrainingForm(ctx.api); if (t) { toast.success('Training created'); ctx.navigate(`/trainings/${t.id}`); } } }),
    }),
    h('section', { class: 'card', 'aria-label': 'Training list' },
      h('div', { class: 'toolbar', role: 'search' }, h('div', { class: 'search grow' }, icon('search'), searchInput), statusSelect, categorySelect),
      results, footer));

  function onSort(key) {
    state.sort = { key, order: state.sort.key === key && state.sort.order === 'asc' ? 'desc' : 'asc' };
    state.page = 1;
    load();
  }

  function renderTable(res) {
    if (!res.data.length) {
      const filtered = state.search || state.status || state.category;
      results.replaceChildren(emptyState({
        iconName: 'calendar',
        title: filtered ? 'No trainings match your filters' : 'No trainings yet',
        text: filtered ? 'Try a different search term or clear the filters.' : 'Plan the first training to get started.',
        action: filtered ? button({ text: 'Clear filters', onClick: () => { searchInput.value = ''; statusSelect.value = ''; categorySelect.value = ''; Object.assign(state, { search: '', status: '', category: '' }); apply(); } }) : null,
      }));
      footer.replaceChildren();
      return;
    }

    const table = h('table', { class: 'data' },
      h('caption', { class: 'sr-only' }, `Trainings, page ${res.meta.page} of ${res.meta.totalPages}`),
      h('thead', null, h('tr', null,
        sortHeader('Training', 'title', state.sort, onSort),
        sortHeader('Category', 'category', state.sort, onSort, 'hide-md'),
        sortHeader('Dates', 'startDate', state.sort, onSort),
        sortHeader('Capacity', 'capacity', state.sort, onSort),
        sortHeader('Budget', 'budget', state.sort, onSort, 'hide-md'),
        sortHeader('Status', 'status', state.sort, onSort),
        h('th', { scope: 'col', class: 'actions' }, h('span', { class: 'sr-only' }, 'Actions')))),
      h('tbody', null, res.data.map((t) => {
        const locked = ['completed', 'cancelled'].includes(t.status);
        return h('tr', null,
          h('td', null, h('div', { class: 'cell-person' }, h('div', null, h('a', { class: 'row-link', href: `#/trainings/${t.id}` }, t.title), h('small', null, t.trainer)))),
          h('td', { class: 'hide-md' }, h('span', { class: 'chip' }, t.category)),
          h('td', { class: 'nowrap' }, dateRange(t.startDate, t.endDate)),
          h('td', null, meter(t.enrolledCount, t.capacity)),
          h('td', { class: 'hide-md nowrap' }, formatMoney(t.budget)),
          h('td', null, badge(t.status)),
          h('td', { class: 'actions' },
            h('a', { class: 'btn btn-sm btn-ghost btn-icon', href: `#/trainings/${t.id}`, 'aria-label': `Open ${t.title}`, title: 'Open' }, icon('chevronRight')),
            canWrite && button({ iconName: 'edit', variant: 'ghost', size: 'sm', ariaLabel: `Edit ${t.title}`, title: locked ? `A ${t.status} training cannot be edited` : 'Edit', disabled: locked, onClick: async () => { if (await openTrainingForm(ctx.api, t)) { toast.success('Training updated'); load(); } } }),
            canDelete && button({ iconName: 'trash', variant: 'ghost', size: 'sm', ariaLabel: `Delete ${t.title}`, title: 'Delete', onClick: () => remove(t) })));
      })));

    results.replaceChildren(h('div', { class: 'table-wrap' }, table));
    footer.replaceChildren(pager(res.meta, (p) => { state.page = p; load(); }, 'trainings'));
  }

  async function remove(t) {
    const ok = await confirmDialog({
      title: 'Delete training?',
      message: `"${t.title}" and its ${t.enrolledCount} enrolment(s) will be permanently removed. Consider cancelling it instead to keep the history.`,
      confirmLabel: 'Delete training',
      danger: true,
    });
    if (!ok) return;
    try { await ctx.api.trainings.remove(t.id); toast.success('Training deleted'); load(); } catch (err) { toast.error(err.message); }
  }

  async function load() {
    const id = (requestId += 1);
    results.replaceChildren(loadingRows(8, 5));
    try {
      const res = await ctx.api.trainings.list({ search: state.search, status: state.status, category: state.category, sort: state.sort.key, order: state.sort.order, page: state.page, pageSize: state.pageSize });
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
