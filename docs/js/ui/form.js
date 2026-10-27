import { h, nextId } from '../util/dom.js';

/**
 * Builds labelled form controls from a spec.
 * Field: { name, label, type: text|email|date|number|select|textarea, required, hint,
 *          options: [{value,label}], placeholder, min, max, step, maxlength }
 * An array of fields is rendered as one two-column row.
 */
export function createFormFields(spec, initial = {}) {
  const controls = new Map();
  const root = h('div', { class: 'form' });

  const build = (f) => {
    const id = nextId('f');
    const hintId = `${id}-hint`;
    const errId = `${id}-err`;
    const value = initial[f.name] ?? f.defaultValue ?? '';
    let input;
    if (f.type === 'select') {
      input = h(
        'select',
        { class: 'select', id, name: f.name },
        (f.placeholder || !f.required) && h('option', { value: '' }, f.placeholder || '-'),
        f.options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label)),
      );
      if (value !== '') input.value = String(value);
    } else if (f.type === 'textarea') {
      input = h('textarea', { class: 'textarea', id, name: f.name, rows: 3, maxlength: f.maxlength }, value);
    } else {
      input = h('input', {
        class: 'input', id, name: f.name, type: f.type || 'text', value,
        placeholder: f.placeholder, min: f.min, max: f.max, step: f.step, maxlength: f.maxlength,
        autocomplete: f.autocomplete || 'off',
      });
    }
    const err = h('div', { class: 'error', id: errId, hidden: true });
    const describedBy = [f.hint && hintId, errId].filter(Boolean).join(' ');
    input.setAttribute('aria-describedby', describedBy);
    if (f.required) input.setAttribute('aria-required', 'true');

    controls.set(f.name, { spec: f, input, err });
    return h(
      'div',
      { class: 'field' },
      h('label', { for: id }, f.label, f.required && h('span', { class: 'req', 'aria-hidden': 'true' }, ' *')),
      input,
      f.hint && h('div', { class: 'hint', id: hintId }, f.hint),
      err,
    );
  };

  for (const item of spec) {
    if (Array.isArray(item)) root.append(h('div', { class: 'form-row' }, item.map(build)));
    else root.append(build(item));
  }

  const setError = (name, message) => {
    const c = controls.get(name);
    if (!c) return false;
    c.err.textContent = message;
    c.err.hidden = false;
    c.input.setAttribute('aria-invalid', 'true');
    return true;
  };

  return {
    el: root,
    values() {
      const out = {};
      for (const [name, { spec: f, input }] of controls) {
        const raw = input.value;
        if (f.type === 'number') out[name] = raw === '' ? undefined : Number(raw);
        else out[name] = typeof raw === 'string' ? raw.trim() : raw;
        if (out[name] === '' && !f.keepEmpty) out[name] = f.emptyAs === undefined ? '' : f.emptyAs;
      }
      return out;
    },
    clearErrors() {
      for (const { input, err } of controls.values()) {
        err.hidden = true;
        err.textContent = '';
        input.removeAttribute('aria-invalid');
      }
    },
    /** Returns the details that did not match any field. */
    showErrors(details = []) {
      const unmatched = [];
      let first = true;
      for (const d of details) {
        if (setError(d.field, d.message)) {
          if (first) controls.get(d.field).input.focus();
          first = false;
        } else unmatched.push(d);
      }
      return unmatched;
    },
    validateRequired() {
      let failed = false;
      for (const [name, { spec: f, input }] of controls) {
        if (f.required && input.value.trim() === '') {
          setError(name, `${f.label} is required`);
          if (!failed) input.focus();
          failed = true;
        }
      }
      return failed;
    },
    focusFirst() {
      const first = controls.values().next().value;
      if (first) first.input.focus();
    },
  };
}
