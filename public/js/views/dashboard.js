import { h } from '../util/dom.js';
import { icon } from '../util/icons.js';
import { formatMoney, monthLabel, label, dateRange } from '../util/format.js';
import { pageHeader, kpiCard, loadingBlock, errorState, emptyState, badge } from '../ui/components.js';
import { columnChart, donutChart, hbarList } from '../ui/charts.js';

const STATUS_COLORS = { planned: '#3b82f6', in_progress: '#f59e0b', completed: '#16a34a', cancelled: '#f87171' };
const STATUS_ORDER = ['planned', 'in_progress', 'completed', 'cancelled'];

export function mountDashboard(root, ctx) {
  const first = ctx.user.fullName.split(' ')[0];
  const body = h('div', { class: 'stack' }, loadingBlock(96), loadingBlock(300));
  root.append(pageHeader({ title: 'Dashboard', subtitle: `Welcome back, ${first}. Here is how training looks right now.` }), body);

  async function load() {
    body.replaceChildren(loadingBlock(96), loadingBlock(300));
    try {
      const data = await ctx.api.dashboard();
      if (!ctx.isActive()) return;
      body.replaceChildren(...build(data));
    } catch (err) {
      if (!ctx.isActive()) return;
      body.replaceChildren(h('div', { class: 'card' }, errorState(err, load)));
    }
  }
  load();
}

function build(data) {
  const k = data.kpis;
  const kpis = h('div', { class: 'grid kpis', role: 'list', 'aria-label': 'Key figures' },
    [
      { label: 'Active employees', value: k.activeEmployees, sub: `of ${k.totalEmployees} in total`, iconName: 'users' },
      { label: 'Upcoming trainings', value: k.upcomingTrainings, sub: `${k.inProgressTrainings} in progress now`, iconName: 'calendar', tone: 'blue' },
      { label: 'Completed this year', value: k.completedThisYear, sub: 'finished sessions', iconName: 'award', tone: 'green' },
      { label: 'Budget this year', value: formatMoney(k.budgetThisYear), sub: 'excl. cancelled', iconName: 'euro', tone: 'amber' },
      { label: 'Enrolments', value: k.totalEnrollments, sub: 'across all trainings', iconName: 'layers', tone: 'teal' },
      { label: 'Completion rate', value: `${k.completionRate}%`, sub: 'of finished trainings', iconName: 'trending', tone: 'rose' },
    ].map((c) => { const el = kpiCard(c); el.setAttribute('role', 'listitem'); return el; }));

  // Budget by month
  const nowKey = new Date().toISOString().slice(0, 7);
  const budgetTotal = data.budgetByMonth.reduce((s, m) => s + m.budget, 0);
  const budgetChart = columnChart({
    ariaLabel: `Training budget by month, ${formatMoney(budgetTotal)} in total over the last 12 months`,
    data: data.budgetByMonth.map((m) => ({
      label: monthLabel(m.month),
      value: m.budget,
      kind: m.month === nowKey ? 'current' : m.month > nowKey ? 'future' : 'past',
      tooltip: `${monthLabel(m.month)} ${m.month.slice(0, 4)}: ${formatMoney(m.budget)} (${m.trainings} training${m.trainings === 1 ? '' : 's'})`,
    })),
  });
  const budgetCard = h('section', { class: 'card chart-card', 'aria-labelledby': 'h-budget' },
    h('div', { class: 'card-header' }, h('div', null, h('h2', { id: 'h-budget' }, 'Training budget by month'), h('p', null, 'Darker bar = current month, light bars = scheduled'))),
    h('div', { class: 'card-body' }, budgetChart));

  // Status donut
  const byStatus = STATUS_ORDER.map((s) => ({ key: s, label: label(s), value: data.trainingsByStatus.find((x) => x.status === s)?.count || 0, color: STATUS_COLORS[s] }));
  const totalTrainings = byStatus.reduce((s, x) => s + x.value, 0);
  const statusCard = h('section', { class: 'card chart-card', 'aria-labelledby': 'h-status' },
    h('div', { class: 'card-header' }, h('div', null, h('h2', { id: 'h-status' }, 'Trainings by status'), h('p', null, 'Current state of the whole catalogue'))),
    h('div', { class: 'card-body' },
      totalTrainings
        ? h('div', { class: 'donut-wrap' },
          donutChart({ segments: byStatus, centerValue: String(totalTrainings), centerLabel: 'trainings', ariaLabel: `Trainings by status: ${byStatus.map((s) => `${s.value} ${s.label}`).join(', ')}` }),
          h('ul', { class: 'legend' }, byStatus.map((s) => h('li', null, h('i', { style: `background:${s.color}` }), s.label, h('b', null, String(s.value))))))
        : emptyState({ title: 'No trainings yet', text: 'Create the first training to see the breakdown.' })));

  // Departments
  const deptCard = h('section', { class: 'card', 'aria-labelledby': 'h-dept' },
    h('div', { class: 'card-header' }, h('div', null, h('h2', { id: 'h-dept' }, 'Employees by department'), h('p', null, 'Active employees'))),
    h('div', { class: 'card-body' },
      data.departmentDistribution.length
        ? hbarList(data.departmentDistribution.map((d) => ({ label: d.department, value: d.count })))
        : emptyState({ title: 'No employees yet' })));

  // Upcoming
  const upcomingCard = h('section', { class: 'card', 'aria-labelledby': 'h-upcoming' },
    h('div', { class: 'card-header', style: 'padding-bottom:8px' },
      h('div', null, h('h2', { id: 'h-upcoming' }, 'Upcoming trainings'), h('p', null, 'Next sessions on the calendar')),
      h('a', { class: 'btn btn-sm', href: '#/trainings' }, 'View all')),
    data.upcomingTrainings.length
      ? h('ul', { class: 'upcoming' }, data.upcomingTrainings.map((t) => {
        const d = new Date(`${t.startDate}T00:00:00Z`);
        return h('li', null,
          h('div', { class: 'date-block', 'aria-hidden': 'true' }, h('b', null, String(d.getUTCDate())), h('span', null, monthLabel(t.startDate.slice(0, 7)))),
          h('div', { class: 'grow' },
            h('a', { href: `#/trainings/${t.id}` }, t.title),
            h('small', null, `${dateRange(t.startDate, t.endDate)} · ${t.trainer.split(' (')[0]}`)),
          h('div', { class: 'side' }, badge(t.status), h('small', { class: 'muted' }, `${t.enrolledCount}/${t.capacity} seats`)));
      }))
      : h('div', { class: 'empty-inline' }, icon('calendar'), h('p', null, 'Nothing scheduled. Plan a training to see it here.')));

  return [kpis, h('div', { class: 'grid grid-main' }, budgetCard, statusCard), h('div', { class: 'grid grid-2' }, deptCard, upcomingCard)];
}
