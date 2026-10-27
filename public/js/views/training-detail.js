import { h, debounce } from '../util/dom.js';
import { icon } from '../util/icons.js';
import { dateRange, formatMoneyExact, label } from '../util/format.js';
import { can, TRAINING_TRANSITIONS, ENROLLABLE_STATUSES, ATTENDANCE_STATUSES, PARTICIPANT_STATUSES } from '../constants.js';
import { toast } from '../ui/toast.js';
import { openModal, confirmDialog } from '../ui/modal.js';
import { pageHeader, button, badge, avatar, meter, emptyState, errorState, loadingBlock, loadingRows } from '../ui/components.js';
import { openTrainingForm } from './trainings.js';

const STATUS_ACTIONS = {
  in_progress: { text: 'Start training', iconName: 'play', variant: 'primary', toast: 'Training started' },
  completed: { text: 'Mark completed', iconName: 'checkCircle', variant: 'primary', toast: 'Training marked as completed' },
  cancelled: { text: 'Cancel training', iconName: 'x', variant: 'danger-outline', toast: 'Training cancelled', confirm: true },
};

export function mountTrainingDetail(root, ctx, id) {
  const canWrite = can.write(ctx.user);
  const canDelete = can.delete(ctx.user);
  const body = h('div', { class: 'stack' }, loadingBlock(120), loadingBlock(280));
  root.append(body);

  async function load() {
    try {
      const t = await ctx.api.trainings.get(id);
      if (!ctx.isActive()) return;
      render(t);
    } catch (err) {
      if (!ctx.isActive()) return;
      body.replaceChildren(
        h('a', { class: 'btn btn-sm', href: '#/trainings' }, icon('chevronLeft'), 'Back to trainings'),
        h('div', { class: 'card' }, err.status === 404 ? emptyState({ iconName: 'calendar', title: 'Training not found', text: 'It may have been deleted.' }) : errorState(err, load)));
    }
  }

  // Replaces the whole view with a fresh server response (every mutation returns the new detail).
  function render(t) {
    ctx.setTitle(t.title);
    body.replaceChildren(...build(t));
  }

  async function run(promise, okMessage) {
    try {
      const result = await promise;
      if (okMessage) toast.success(okMessage);
      return result;
    } catch (err) {
      toast.error(err.message);
      load();
      return null;
    }
  }

  function build(t) {
    const locked = ['completed', 'cancelled'].includes(t.status);
    const actions = [];
    if (canWrite) {
      for (const next of TRAINING_TRANSITIONS[t.status]) {
        const a = STATUS_ACTIONS[next];
        actions.push(button({
          text: a.text, iconName: a.iconName, variant: a.variant,
          onClick: async () => {
            if (a.confirm && !(await confirmDialog({ title: 'Cancel this training?', message: `"${t.title}" will be marked as cancelled. Enrolments are kept for the record, but nobody can be added or removed any more.`, confirmLabel: 'Cancel training', danger: true }))) return;
            const updated = await run(ctx.api.trainings.setStatus(t.id, next), a.toast);
            if (updated) load();
          },
        }));
      }
      if (!locked) actions.push(button({ text: 'Edit', iconName: 'edit', onClick: async () => { if (await openTrainingForm(ctx.api, t)) { toast.success('Training updated'); load(); } } }));
    }
    if (canDelete) {
      actions.push(button({
        iconName: 'trash', variant: 'danger-outline', ariaLabel: 'Delete training', title: 'Delete training',
        onClick: async () => {
          if (!(await confirmDialog({ title: 'Delete training?', message: `"${t.title}" and its ${t.enrolledCount} enrolment(s) will be permanently removed.`, confirmLabel: 'Delete training', danger: true }))) return;
          try {
            await ctx.api.trainings.remove(t.id);
            toast.success('Training deleted');
            ctx.navigate('/trainings');
          } catch (err) { toast.error(err.message); }
        },
      }));
    }

    const header = pageHeader({
      breadcrumb: [h('a', { href: '#/trainings' }, 'Trainings'), h('span', { 'aria-hidden': 'true' }, '/'), h('span', { 'aria-current': 'page' }, t.title)],
      title: t.title,
      subtitle: undefined,
      actions: h('div', { class: 'workflow' }, actions),
    });
    header.querySelector('h1').after(h('div', { class: 'summary-chips', style: 'margin-top:8px' }, badge(t.status), h('span', { class: 'chip' }, t.category)));

    const info = h('section', { class: 'card', 'aria-labelledby': 'h-info' },
      h('div', { class: 'card-header' }, h('h2', { id: 'h-info' }, 'Details')),
      h('div', { class: 'card-body' },
        h('dl', { class: 'detail-grid' },
          [
            ['Dates', dateRange(t.startDate, t.endDate)],
            ['Trainer', t.trainer],
            ['Location', t.location || '-'],
            ['Budget', formatMoneyExact(t.budget)],
            ['Seats', meter(t.enrolledCount, t.capacity)],
          ].map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v)))),
        t.description && h('p', { class: 'muted', style: 'margin-top:18px' }, t.description)));

    return [header, info, participantsCard(t, locked)];
  }

  function participantsCard(t, locked) {
    const canEnrol = canWrite && ENROLLABLE_STATUSES.includes(t.status);
    const full = t.enrolledCount >= t.capacity;
    const attendanceOpen = canWrite && ATTENDANCE_STATUSES.includes(t.status);
    const s = t.summary;

    const addBtn = canEnrol && button({
      text: full ? 'Training is full' : 'Add participant', iconName: 'userPlus', variant: 'primary', disabled: full,
      title: full ? 'No seats left. Remove someone or increase the capacity.' : undefined,
      onClick: () => openPicker(t),
    });

    let content;
    if (!t.participants.length) {
      content = emptyState({
        iconName: 'users', title: 'No participants yet',
        text: canEnrol ? 'Add employees to fill the seats of this training.' : 'Nobody was enrolled in this training.',
        action: canEnrol ? addBtn : null,
      });
    } else {
      const hint = !ATTENDANCE_STATUSES.includes(t.status) && canWrite
        ? h('div', { class: 'table-note' }, t.status === 'planned' ? 'Attendance can be recorded once the training has started.' : 'This training was cancelled, so attendance is not tracked.')
        : null;
      content = h('div', null, hint, h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
        h('caption', { class: 'sr-only' }, `Participants of ${t.title}`),
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, 'Participant'),
          h('th', { scope: 'col', class: 'hide-md' }, 'Department'),
          h('th', { scope: 'col' }, 'Attendance'),
          h('th', { scope: 'col', class: 'actions' }, h('span', { class: 'sr-only' }, 'Actions')))),
        h('tbody', null, t.participants.map((p) => h('tr', null,
          h('td', null, h('div', { class: 'cell-person' }, avatar(p.fullName), h('div', null, h('a', { class: 'row-link', href: `#/employees/${p.employeeId}` }, p.fullName), h('small', null, `${p.employeeNumber} · ${p.jobTitle}`)))),
          h('td', { class: 'hide-md' }, p.department),
          h('td', null, attendanceOpen
            ? attendanceSelect(t, p)
            : badge(p.status)),
          h('td', { class: 'actions' }, canEnrol && button({
            iconName: 'x', variant: 'ghost', size: 'sm', ariaLabel: `Remove ${p.fullName} from this training`, title: 'Remove',
            onClick: async () => { const r = await run(ctx.api.trainings.removeParticipant(t.id, p.employeeId), `${p.fullName} was removed`); if (r) render(r); },
          }))))))));
    }

    return h('section', { class: 'card', 'aria-labelledby': 'h-participants' },
      h('div', { class: 'card-header', style: 'padding-bottom:12px; flex-wrap:wrap' },
        h('div', null, h('h2', { id: 'h-participants' }, `Participants (${t.enrolledCount}/${t.capacity})`),
          h('div', { class: 'summary-chips', style: 'margin-top:8px' }, PARTICIPANT_STATUSES.map((k) => h('span', { class: `badge badge-${k}` }, `${s[k]} ${label(k).toLowerCase()}`)))),
        addBtn || null),
      content);
  }

  function attendanceSelect(t, p) {
    const sel = h('select', { class: 'select compact attendance-select', 'aria-label': `Attendance for ${p.fullName}` },
      PARTICIPANT_STATUSES.map((k) => h('option', { value: k, selected: k === p.status }, label(k))));
    sel.addEventListener('change', async () => {
      sel.disabled = true;
      const r = await run(ctx.api.trainings.setParticipantStatus(t.id, p.employeeId, sel.value), `${p.fullName}: ${label(sel.value).toLowerCase()}`);
      if (r) render(r);
    });
    return sel;
  }

  // ---- participant picker ------------------------------------------------
  function openPicker(t) {
    let current = t;
    let requestId = 0;
    const list = h('div', { 'aria-live': 'polite' });
    const note = h('p', { class: 'muted', style: 'margin-top:10px;font-size:0.85rem' });
    const input = h('input', { class: 'input', type: 'search', id: 'picker-search', placeholder: 'Search active employees by name, title or number', 'aria-label': 'Search employees', autocomplete: 'off' });

    const content = h('div', null,
      h('div', { class: 'modal-body' }, h('div', { class: 'search' }, icon('search'), input), note, list),
      h('div', { class: 'modal-foot' }, button({ text: 'Done', variant: 'primary', onClick: () => modal.close() })));

    const modal = openModal({ title: `Add participants to ${t.title}`, content, wide: true, onClose: () => load() });
    input.focus();

    async function search() {
      const id = (requestId += 1);
      list.replaceChildren(loadingRows(4, 3));
      try {
        const res = await ctx.api.employees.list({ search: input.value.trim(), status: 'active', pageSize: 30 });
        if (id !== requestId) return;
        const enrolled = new Set(current.participants.map((p) => p.employeeId));
        const rows = res.data.filter((e) => !enrolled.has(e.id));
        const seatsLeft = current.capacity - current.enrolledCount;
        note.textContent = seatsLeft > 0 ? `${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} left. Employees already enrolled are hidden.` : 'This training is now full.';
        if (!rows.length) { list.replaceChildren(emptyState({ iconName: 'users', title: 'No employees found', text: 'Try another search term.' })); return; }
        list.replaceChildren(h('ul', { class: 'picker-list' }, rows.map((e) => h('li', null,
          avatar(e.fullName),
          h('div', { class: 'grow' }, h('strong', null, e.fullName), h('small', null, `${e.jobTitle} · ${e.department}`)),
          button({
            text: 'Add', iconName: 'plus', size: 'sm', ariaLabel: `Add ${e.fullName}`, disabled: seatsLeft <= 0,
            onClick: async (ev) => {
              const btn = ev.currentTarget;
              btn.disabled = true;
              try {
                current = await ctx.api.trainings.addParticipant(current.id, e.id);
                toast.success(`${e.fullName} was added`);
                render(current);
                search();
              } catch (err) {
                toast.error(err.message);
                btn.disabled = false;
                if (err.code === 'CAPACITY_FULL' || err.code === 'ALREADY_ENROLLED') { current = await ctx.api.trainings.get(current.id); render(current); search(); }
              }
            },
          })))));
      } catch (err) {
        if (id === requestId) list.replaceChildren(errorState(err, search));
      }
    }
    input.addEventListener('input', debounce(search, 250));
    search();
  }

  load();
}
