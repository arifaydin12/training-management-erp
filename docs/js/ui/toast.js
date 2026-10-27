import { h } from '../util/dom.js';
import { icon } from '../util/icons.js';

const ICONS = { success: 'checkCircle', error: 'alert', warning: 'alert', info: 'info' };

function show(type, message, timeout) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = h(
    'div',
    { class: `toast ${type}`, role: type === 'error' ? 'alert' : 'status' },
    icon(ICONS[type]),
    h('p', null, message),
    h('button', { type: 'button', 'aria-label': 'Dismiss notification', onClick: () => remove() }, icon('x')),
  );
  const remove = () => el.remove();
  host.append(el);
  while (host.children.length > 4) host.firstChild.remove();
  setTimeout(remove, timeout);
}

export const toast = {
  success: (m) => show('success', m, 4000),
  error: (m) => show('error', m, 7000),
  warning: (m) => show('warning', m, 6000),
  info: (m) => show('info', m, 4500),
};
