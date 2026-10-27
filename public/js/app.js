import { createApi } from './api/index.js';
import { h, clear } from './util/dom.js';
import { icon } from './util/icons.js';
import { label } from './util/format.js';
import { can } from './constants.js';
import { toast } from './ui/toast.js';
import { confirmDialog } from './ui/modal.js';
import { avatar } from './ui/components.js';
import { mountLogin } from './views/login.js';
import { mountDashboard } from './views/dashboard.js';
import { mountEmployees } from './views/employees.js';
import { mountEmployeeDetail } from './views/employee-detail.js';
import { mountTrainings } from './views/trainings.js';
import { mountTrainingDetail } from './views/training-detail.js';
import { mountAudit } from './views/audit.js';

const SESSION_KEY = 'erp.session';
const APP_NAME = 'Training Management ERP';

const config = window.__APP_CONFIG__ || {};
const appEl = document.getElementById('app');

const session = {
  load() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (_e) { return null; }
  },
  save(value) { sessionStorage.setItem(SESSION_KEY, JSON.stringify(value)); },
  clear() { sessionStorage.removeItem(SESSION_KEY); },
};

const ROUTES = [
  { re: /^\/dashboard$/, nav: 'dashboard', title: 'Dashboard', mount: mountDashboard },
  { re: /^\/employees$/, nav: 'employees', title: 'Employees', mount: mountEmployees },
  { re: /^\/employees\/(\d+)$/, nav: 'employees', title: 'Employee', mount: mountEmployeeDetail },
  { re: /^\/trainings$/, nav: 'trainings', title: 'Trainings', mount: mountTrainings },
  { re: /^\/trainings\/(\d+)$/, nav: 'trainings', title: 'Training', mount: mountTrainingDetail },
  { re: /^\/audit$/, nav: 'audit', title: 'Audit log', mount: mountAudit, allow: can.audit },
];

const NAV = [
  { key: 'dashboard', text: 'Dashboard', href: '#/dashboard', icon: 'dashboard' },
  { key: 'employees', text: 'Employees', href: '#/employees', icon: 'users' },
  { key: 'trainings', text: 'Trainings', href: '#/trainings', icon: 'calendar' },
  { key: 'audit', text: 'Audit log', href: '#/audit', icon: 'clipboard', allow: can.audit },
];

let api;
let shell = null; // { el, content, links, close }
let cleanup = null;
let renderToken = 0;

const currentPath = () => (location.hash.replace(/^#/, '') || '/').split('?')[0];
const navigate = (path) => {
  if (currentPath() === path) render();
  else location.hash = `#${path}`;
};

// ------------------------------------------------------------------ shell
function buildShell(user) {
  const links = new Map();
  const shellEl = h('div', { class: 'shell' });

  const nav = h('nav', { class: 'nav', 'aria-label': 'Main navigation' }, h('div', { class: 'nav-label' }, 'Workspace'));
  for (const item of NAV) {
    if (item.allow && !item.allow(user)) continue;
    const a = h('a', { href: item.href, onClick: () => shellEl.classList.remove('nav-open') }, icon(item.icon), item.text);
    links.set(item.key, a);
    nav.append(a);
  }

  const footer = h('div', { class: 'sidebar-footer' });
  if (api.demo) {
    footer.append(
      h('div', { class: 'demo-note' },
        h('strong', null, 'Demo mode'),
        'All data is stored in this browser only.',
        h('button', { type: 'button', onClick: resetDemo }, 'Reset demo data')),
    );
  }

  const sidebar = h('aside', { class: 'sidebar', id: 'sidebar' },
    h('a', { class: 'brand', href: '#/dashboard', 'aria-label': `${APP_NAME} home` },
      h('img', { class: 'brand-mark', src: 'favicon.svg', alt: '', width: 34, height: 34 }),
      h('span', null, 'Training ERP', h('small', null, 'Learning & development'))),
    nav,
    footer);

  const menuBtn = h('button', {
    type: 'button', class: 'btn btn-icon menu-btn', 'aria-label': 'Open navigation menu', 'aria-controls': 'sidebar', 'aria-expanded': 'false',
    onClick: () => toggleNav(),
  }, icon('menu'));
  const scrim = h('div', { class: 'scrim', hidden: true, onClick: () => toggleNav(false) });

  function toggleNav(force) {
    const open = force === undefined ? !shellEl.classList.contains('nav-open') : force;
    shellEl.classList.toggle('nav-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    scrim.hidden = !open;
  }

  const topbar = h('header', { class: 'topbar' },
    menuBtn,
    api.demo && h('span', { class: 'demo-badge', title: 'Demo mode: data stays in your browser' }, 'Demo mode', h('span', { class: 'long' }, ' - data stays in your browser')),
    h('div', { class: 'topbar-spacer' }),
    h('div', { class: 'user-chip' },
      h('div', { class: 'who' }, h('strong', null, user.fullName), h('span', null, label(user.role))),
      avatar(user.fullName),
      h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onClick: logout, 'aria-label': 'Sign out' }, icon('logout'), h('span', null, 'Sign out'))));

  const content = h('main', { class: 'content', id: 'main', tabindex: '-1' });
  shellEl.append(sidebar, h('div', { class: 'main-col' }, topbar, content), scrim);

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && shellEl.classList.contains('nav-open')) toggleNav(false); });
  return { el: shellEl, content, links, close: () => toggleNav(false) };
}

async function resetDemo() {
  const ok = await confirmDialog({
    title: 'Reset demo data?',
    message: 'This restores the original sample employees and trainings and discards everything you changed in this browser.',
    confirmLabel: 'Reset data',
    danger: true,
  });
  if (!ok) return;
  await api.resetDemo();
  toast.success('Demo data was reset');
  const path = currentPath();
  if (/^\/(employees|trainings)\/\d+$/.test(path)) navigate(`/${path.split('/')[1]}`);
  else render();
}

// ------------------------------------------------------------------ auth
function logout(message) {
  session.clear();
  api.setToken(null);
  shell = null;
  if (typeof message === 'string') toast.info(message);
  if (cleanup) { cleanup(); cleanup = null; }
  navigate('/login');
}

function onLoggedIn(result) {
  session.save({ token: result.token, user: result.user });
  api.setToken(result.token);
  shell = null;
  navigate('/dashboard');
}

// ------------------------------------------------------------------ rendering
async function render() {
  const token = (renderToken += 1);
  const saved = session.load();
  const path = currentPath();

  if (cleanup) { try { cleanup(); } catch (_e) { /* view already gone */ } cleanup = null; }

  if (!saved) {
    shell = null;
    if (path !== '/login') { history.replaceState(null, '', '#/login'); }
    clear(appEl);
    document.title = `Sign in - ${APP_NAME}`;
    appEl.removeAttribute('aria-busy');
    const main = h('div', { id: 'main', tabindex: '-1' });
    appEl.append(main);
    cleanup = mountLogin(main, { api, config, onLoggedIn });
    return;
  }

  if (path === '/login' || path === '/' || path === '') {
    history.replaceState(null, '', '#/dashboard');
    return render();
  }

  const route = ROUTES.find((r) => r.re.test(path));
  if (!shell) {
    shell = buildShell(saved.user);
    clear(appEl);
    appEl.append(shell.el);
  }
  appEl.removeAttribute('aria-busy');
  shell.close();

  const content = shell.content;
  clear(content);

  for (const [key, link] of shell.links) {
    if (route && key === route.nav) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  if (!route || (route.allow && !route.allow(saved.user))) {
    document.title = `Not found - ${APP_NAME}`;
    content.append(
      h('div', { class: 'card' },
        h('div', { class: 'state' }, icon('alert'), h('h3', null, route ? 'Access denied' : 'Page not found'),
          h('p', null, route ? 'Your role does not have access to this page.' : 'The page you are looking for does not exist.'),
          h('a', { class: 'btn btn-primary', href: '#/dashboard' }, 'Back to dashboard'))));
    return;
  }

  document.title = `${route.title} - ${APP_NAME}`;
  const match = route.re.exec(path);
  const ctx = {
    api,
    user: saved.user,
    navigate,
    isActive: () => token === renderToken,
    setTitle: (t) => { if (token === renderToken) document.title = `${t} - ${APP_NAME}`; },
  };
  cleanup = route.mount(content, ctx, ...match.slice(1).map(Number)) || null;
  content.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------------ boot
async function boot() {
  api = await createApi(config);
  api.onUnauthorized = () => logout('Your session has expired. Please sign in again.');

  const saved = session.load();
  if (saved) {
    api.setToken(saved.token);
    if (!api.demo) {
      try {
        await api.auth.me();
      } catch (_err) {
        session.clear();
        api.setToken(null);
      }
    }
  }

  window.addEventListener('hashchange', render);
  await render();
}

boot().catch((err) => {
  console.error(err);
  clear(appEl);
  appEl.append(h('div', { class: 'boot', role: 'alert' }, `The application failed to start: ${err.message}`));
});
