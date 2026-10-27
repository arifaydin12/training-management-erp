import { h } from '../util/dom.js';
import { icon } from '../util/icons.js';
import { initials, avatarColor, label } from '../util/format.js';

export const badge = (status) => h('span', { class: `badge badge-${status}` }, label(status));

export function avatar(name, large = false) {
  const el = h('span', { class: `avatar${large ? ' lg' : ''}`, 'aria-hidden': 'true' }, initials(name));
  el.style.background = avatarColor(name);
  return el;
}

export function button({ text, iconName, variant = '', size = '', onClick, type = 'button', ariaLabel, disabled = false, title }) {
  const cls = ['btn', variant && `btn-${variant}`, size && `btn-${size}`].filter(Boolean).join(' ');
  return h(
    'button',
    { class: cls, type, onClick, 'aria-label': ariaLabel, disabled, title },
    iconName && icon(iconName),
    text && h('span', null, text),
  );
}

export function meter(enrolled, capacity) {
  const pct = capacity ? Math.min(100, Math.round((enrolled / capacity) * 100)) : 0;
  const bar = h('span');
  bar.style.width = `${pct}%`;
  return h(
    'div',
    { class: `meter${enrolled >= capacity ? ' full' : ''}`, role: 'img', 'aria-label': `${enrolled} of ${capacity} seats taken` },
    h('div', { class: 'meter-label' }, h('strong', null, `${enrolled} / ${capacity}`), h('span', null, enrolled >= capacity ? 'Full' : `${pct}%`)),
    h('div', { class: 'meter-bar' }, bar),
  );
}

export function emptyState({ iconName = 'inbox', title, text, action }) {
  return h('div', { class: 'state' }, icon(iconName), h('h3', null, title), text && h('p', null, text), action);
}

export function errorState(err, onRetry) {
  return h(
    'div',
    { class: 'state error', role: 'alert' },
    icon('alert'),
    h('h3', null, 'Something went wrong'),
    h('p', null, err?.message || 'The data could not be loaded.'),
    onRetry && button({ text: 'Try again', iconName: 'refresh', onClick: onRetry }),
  );
}

export function loadingRows(rows = 6, cols = 4) {
  const wrap = h('div', { class: 'skeleton-rows', role: 'status', 'aria-label': 'Loading' });
  for (let r = 0; r < rows; r += 1) {
    wrap.append(h('div', { class: 'skeleton-row' }, Array.from({ length: cols }, (_, i) => h('span', { class: `skeleton${i === cols - 1 ? ' sm' : ''}` }))));
  }
  return wrap;
}

export function loadingBlock(height = 160) {
  const el = h('div', { class: 'skeleton block', role: 'status', 'aria-label': 'Loading' });
  el.style.height = `${height}px`;
  return el;
}

/** Pager for { page, pageSize, total, totalPages }. */
export function pager(meta, onPage, noun = 'results') {
  const { page, pageSize, total, totalPages } = meta;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const pages = [];
  const add = (p) => pages.push(p);
  for (let p = 1; p <= totalPages; p += 1) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) add(p);
    else if (pages[pages.length - 1] !== '...') add('...');
  }

  return h(
    'nav',
    { class: 'pager', 'aria-label': 'Pagination' },
    h('span', { 'aria-live': 'polite' }, `Showing ${from}-${to} of ${total} ${noun}`),
    totalPages > 1 &&
      h(
        'div',
        { class: 'pager-nav' },
        button({ iconName: 'chevronLeft', ariaLabel: 'Previous page', size: 'sm', disabled: page <= 1, onClick: () => onPage(page - 1) }),
        pages.map((p) =>
          p === '...'
            ? h('span', { 'aria-hidden': 'true' }, '…')
            : h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': `Page ${p}`, 'aria-current': p === page ? 'page' : null, onClick: () => onPage(p) }, String(p)),
        ),
        button({ iconName: 'chevronRight', ariaLabel: 'Next page', size: 'sm', disabled: page >= totalPages, onClick: () => onPage(page + 1) }),
      ),
  );
}

/** Table header cell with a sort button. */
export function sortHeader(text, key, sort, onSort, cls = '') {
  const active = sort.key === key;
  const th = h('th', { scope: 'col', class: cls, 'aria-sort': active ? (sort.order === 'asc' ? 'ascending' : 'descending') : 'none' });
  th.append(
    h(
      'button',
      { type: 'button', class: 'sort-btn', onClick: () => onSort(key) },
      text,
      h('span', { class: 'arrow', 'aria-hidden': 'true' }, active ? (sort.order === 'asc' ? '▲' : '▼') : '↕'),
    ),
  );
  return th;
}

export function kpiCard({ label: text, value, sub, iconName, tone = '' }) {
  return h(
    'div',
    { class: 'card kpi' },
    h('div', { class: 'kpi-head' }, h('div', { class: 'kpi-label' }, text), h('div', { class: `kpi-icon ${tone}` }, icon(iconName))),
    h('div', { class: 'kpi-value' }, value),
    sub && h('div', { class: 'kpi-sub' }, sub),
  );
}

export function pageHeader({ title, subtitle, actions, breadcrumb }) {
  return h(
    'header',
    { class: 'page-header' },
    h(
      'div',
      null,
      breadcrumb && h('nav', { class: 'breadcrumb', 'aria-label': 'Breadcrumb' }, breadcrumb),
      h('h1', { id: 'page-title' }, title),
      subtitle && h('p', null, subtitle),
    ),
    actions && h('div', { class: 'page-actions' }, actions),
  );
}
