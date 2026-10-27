import { h } from '../util/dom.js';
import { icon } from '../util/icons.js';
import { label } from '../util/format.js';
import { DEMO_USERS, DEMO_PASSWORD } from '../demo/seed-data.js';

export function mountLogin(root, { api, onLoggedIn }) {
  document.getElementById('app').classList.add('login-screen');

  const errorBox = h('div', { class: 'form-error', role: 'alert', hidden: true });
  const userInput = h('input', { class: 'input', id: 'username', name: 'username', autocomplete: 'username', required: true, autofocus: true, 'aria-describedby': 'login-error' });
  const passInput = h('input', { class: 'input', id: 'password', name: 'password', type: 'password', autocomplete: 'current-password', required: true });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary', style: 'width:100%;padding:11px' }, 'Sign in');
  errorBox.id = 'login-error';

  async function signIn(username, password) {
    errorBox.hidden = true;
    submit.classList.add('loading');
    submit.disabled = true;
    try {
      onLoggedIn(await api.auth.login(username, password));
    } catch (err) {
      errorBox.replaceChildren(icon('alert'), h('span', null, err.details?.[0]?.message || err.message));
      errorBox.hidden = false;
      passInput.value = '';
      (err.status === 422 && !username ? userInput : passInput).focus();
    } finally {
      submit.classList.remove('loading');
      submit.disabled = false;
    }
  }

  const form = h('form', { class: 'form', novalidate: true, onSubmit: (e) => { e.preventDefault(); signIn(userInput.value.trim(), passInput.value); } },
    errorBox,
    h('div', { class: 'field' }, h('label', { for: 'username' }, 'Username'), userInput),
    h('div', { class: 'field' }, h('label', { for: 'password' }, 'Password'), passInput),
    submit);

  const demoBlock = api.demo && h('section', { class: 'demo-accounts', 'aria-labelledby': 'demo-heading' },
    h('h3', { id: 'demo-heading' }, 'Demo accounts'),
    DEMO_USERS.map((u) => h('button', { type: 'button', class: 'demo-account', onClick: () => signIn(u.username, DEMO_PASSWORD) },
      h('div', null, h('strong', null, u.fullName), h('span', null, `${label(u.role)} - ${u.username}`)),
      h('span', { 'aria-hidden': 'true' }, 'Sign in →'))),
    h('p', { class: 'demo-hint' }, 'Password for all accounts: ', h('code', null, DEMO_PASSWORD)));

  const features = [
    'Dashboard with budget, attendance and department insights',
    'Capacity-aware enrolment with duplicate protection',
    'Role-based access for admins, HR managers and viewers',
  ];

  root.append(
    h('div', { class: 'login' },
      h('section', { class: 'login-hero', 'aria-label': 'About' },
        h('div', { class: 'brand' }, h('img', { class: 'brand-mark', src: 'favicon.svg', alt: '', width: 34, height: 34 }), h('span', null, 'Training ERP')),
        h('h1', null, 'Plan, track and prove your team\'s learning.'),
        h('p', null, 'One place to manage employees, schedule trainings, enrol participants and follow budgets.'),
        h('ul', null, features.map((f) => h('li', null, icon('checkCircle'), h('span', null, f))))),
      h('section', { class: 'login-panel' },
        h('div', { class: 'login-card' },
          api.demo && h('span', { class: 'demo-badge', style: 'justify-self:start' }, 'Demo mode - data stays in your browser'),
          h('div', null, h('h2', null, 'Sign in'), h('p', { class: 'lead' }, 'Use your Training ERP account to continue.')),
          form,
          demoBlock))));

  document.title = 'Sign in - Training Management ERP';
  return () => document.getElementById('app').classList.remove('login-screen');
}
