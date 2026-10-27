import { h } from '../util/dom.js';
import { icon } from '../util/icons.js';
import { formatDate, dateRange, label } from '../util/format.js';
import { can } from '../constants.js';
import { toast } from '../ui/toast.js';
import { confirmDialog } from '../ui/modal.js';
import { pageHeader, button, badge, avatar, emptyState, errorState, loadingBlock } from '../ui/components.js';
import { openEmployeeForm } from './employees.js';

export function mountEmployeeDetail(root, ctx, id) {
  const body = h('div', { class: 'stack' }, loadingBlock(120), loadingBlock(240));
  root.append(body);

  async function load() {
    try {
      const e = await ctx.api.employees.get(id);
      if (!ctx.isActive()) return;
      ctx.setTitle(e.fullName);
      body.replaceChildren(...build(e));
    } catch (err) {
      if (!ctx.isActive()) return;
      body.replaceChildren(
        h('a', { class: 'btn btn-sm', href: '#/employees' }, icon('chevronLeft'), 'Back to employees'),
        h('div', { class: 'card' }, err.status === 404 ? emptyState({ iconName: 'users', title: 'Employee not found', text: 'This employee may have been deleted.' }) : errorState(err, load)));
    }
  }

  function build(e) {
    const actions = [];
    if (can.write(ctx.user)) actions.push(button({ text: 'Edit', iconName: 'edit', onClick: async () => { if (await openEmployeeForm(ctx.api, e)) { toast.success('Employee updated'); load(); } } }));
    if (can.delete(ctx.user)) {
      actions.push(button({
        text: 'Delete', iconName: 'trash', variant: 'danger-outline',
        onClick: async () => {
          const ok = await confirmDialog({ title: 'Delete employee?', message: `${e.fullName} will be permanently removed together with their enrolments.`, confirmLabel: 'Delete employee', danger: true });
          if (!ok) return;
          try { await ctx.api.employees.remove(e.id); toast.success(`${e.fullName} was deleted`); ctx.navigate('/employees'); } catch (err) { toast.error(err.message); }
        },
      }));
    }

    const header = pageHeader({
      breadcrumb: [h('a', { href: '#/employees' }, 'Employees'), h('span', { 'aria-hidden': 'true' }, '/'), h('span', { 'aria-current': 'page' }, e.fullName)],
      title: e.fullName,
      subtitle: `${e.jobTitle} · ${e.department}`,
      actions,
    });

    const info = h('section', { class: 'card', 'aria-labelledby': 'h-profile' },
      h('div', { class: 'card-header' }, h('h2', { id: 'h-profile' }, 'Profile')),
      h('div', { class: 'card-body' },
        h('div', { class: 'profile-head', style: 'margin-bottom:20px' }, avatar(e.fullName, true), h('div', { class: 'meta' }, badge(e.status), h('span', null, e.employeeNumber))),
        h('dl', { class: 'detail-grid' },
          [['Email', h('a', { href: `mailto:${e.email}` }, e.email)], ['Department', e.department], ['Job title', e.jobTitle], ['Hire date', formatDate(e.hireDate)], ['Trainings', String(e.trainingCount)]]
            .map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v))))));

    const rows = e.trainings;
    const history = h('section', { class: 'card', 'aria-labelledby': 'h-history' },
      h('div', { class: 'card-header', style: 'padding-bottom:12px' }, h('div', null, h('h2', { id: 'h-history' }, 'Training history'), h('p', null, 'Every training this employee is enrolled in'))),
      rows.length
        ? h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
          h('caption', { class: 'sr-only' }, `Trainings of ${e.fullName}`),
          h('thead', null, h('tr', null, ['Training', 'Category', 'Dates', 'Training status', 'Participation'].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', null, rows.map((t) => h('tr', null,
            h('td', null, h('a', { class: 'row-link', href: `#/trainings/${t.trainingId}` }, t.title)),
            h('td', null, h('span', { class: 'chip' }, t.category)),
            h('td', { class: 'nowrap' }, dateRange(t.startDate, t.endDate)),
            h('td', null, badge(t.trainingStatus)),
            h('td', null, badge(t.participationStatus)))))))
        : emptyState({ iconName: 'calendar', title: 'Not enrolled anywhere yet', text: `${e.fullName} has no trainings. Enrol them from a training page.`, action: h('a', { class: 'btn btn-primary', href: '#/trainings' }, 'Browse trainings') }));

    return [header, info, history];
  }

  load();
}
