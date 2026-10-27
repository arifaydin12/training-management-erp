import { h, debounce } from '../util/dom.js';
import { icon } from '../util/icons.js';
import { formatDateTime } from '../util/format.js';
import { pageHeader, pager, emptyState, errorState, loadingRows } from '../ui/components.js';

const ENTITIES = [['', 'All entities'], ['employee', 'Employees'], ['training', 'Trainings'], ['user', 'Users']];

export function mountAudit(root, ctx) {
  const state = { entity: '', search: '', page: 1, pageSize: 15 };
  let requestId = 0;

  const searchInput = h('input', { class: 'input', type: 'search', placeholder: 'Search user, action or details', 'aria-label': 'Search audit log', autocomplete: 'off' });
  const entitySelect = h('select', { class: 'select', 'aria-label': 'Filter by entity' }, ENTITIES.map(([v, t]) => h('option', { value: v }, t)));
  const results = h('div', { 'aria-live': 'polite' });
  const footer = h('div');

  searchInput.addEventListener('input', debounce(() => { state.search = searchInput.value.trim(); state.page = 1; load(); }, 250));
  entitySelect.addEventListener('change', () => { state.entity = entitySelect.value; state.page = 1; load(); });

  root.append(
    pageHeader({ title: 'Audit log', subtitle: 'Who changed what, newest first. Visible to administrators only.' }),
    h('section', { class: 'card', 'aria-label': 'Audit entries' },
      h('div', { class: 'toolbar', role: 'search' }, h('div', { class: 'search grow' }, icon('search'), searchInput), entitySelect),
      results, footer));

  async function load() {
    const id = (requestId += 1);
    results.replaceChildren(loadingRows(8, 4));
    try {
      const res = await ctx.api.audit.list({ entity: state.entity, search: state.search, page: state.page, pageSize: state.pageSize });
      if (id !== requestId || !ctx.isActive()) return;
      if (!res.data.length) {
        results.replaceChildren(emptyState({ iconName: 'clipboard', title: 'No entries found', text: 'Changes made in the application appear here.' }));
        footer.replaceChildren();
        return;
      }
      results.replaceChildren(h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
        h('caption', { class: 'sr-only' }, 'Audit log entries'),
        h('thead', null, h('tr', null, ['When', 'User', 'Action', 'Details'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', null, res.data.map((a) => h('tr', null,
          h('td', { class: 'nowrap' }, formatDateTime(a.createdAt)),
          h('td', null, a.username || '-'),
          h('td', null, h('span', { class: 'audit-action' }, a.action)),
          h('td', null, a.details || '-')))))));
      footer.replaceChildren(pager(res.meta, (p) => { state.page = p; load(); }, 'entries'));
    } catch (err) {
      if (id !== requestId || !ctx.isActive()) return;
      results.replaceChildren(errorState(err, load));
      footer.replaceChildren();
    }
  }

  load();
  return () => { requestId += 1; };
}
