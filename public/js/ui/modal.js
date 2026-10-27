import { h, nextId } from '../util/dom.js';
import { icon } from '../util/icons.js';
import { createFormFields } from './form.js';

/**
 * Opens a native <dialog>: focus trapping, Escape-to-close and an inert background
 * come from the platform. Returns { dialog, close }.
 */
export function openModal({ title, content, wide = false, onClose }) {
  const previouslyFocused = document.activeElement;
  const titleId = nextId('modal-title');
  const dialog = h('dialog', { class: `modal${wide ? ' wide' : ''}`, 'aria-labelledby': titleId });
  const closeBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': 'Close dialog', onClick: () => close() }, icon('x'));
  dialog.append(h('div', { class: 'modal-head' }, h('h2', { id: titleId }, title), closeBtn), content);

  let closed = false;
  function close(value) {
    if (closed) return;
    closed = true;
    if (dialog.open) dialog.close();
    dialog.remove();
    if (previouslyFocused && previouslyFocused.focus && document.contains(previouslyFocused)) previouslyFocused.focus();
    if (onClose) onClose(value);
  }

  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dialog.addEventListener('mousedown', (e) => {
    if (e.target === dialog) close();
  });
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, close };
}

/** Confirmation dialog resolving to true / false. */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const confirmBtn = h('button', { type: 'button', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, onClick: () => { result = true; modal.close(); } }, confirmLabel);
    const cancelBtn = h('button', { type: 'button', class: 'btn', onClick: () => modal.close() }, 'Cancel');
    const content = h(
      'div',
      null,
      h('div', { class: 'modal-body' }, h('p', null, message)),
      h('div', { class: 'modal-foot' }, cancelBtn, confirmBtn),
    );
    const modal = openModal({ title, content, onClose: () => resolve(result) });
    (danger ? cancelBtn : confirmBtn).focus();
  });
}

/**
 * Modal with a form. `onSubmit(values)` must return a promise; when it rejects with an
 * ApiError carrying `details`, errors are shown next to the matching fields.
 * Resolves with the submit result, or undefined when cancelled.
 */
export function formModal({ title, fields, initial = {}, submitLabel = 'Save', onSubmit, wide = false }) {
  return new Promise((resolve) => {
    let result;
    const formFields = createFormFields(fields, initial);
    const banner = h('div', { class: 'form-error', role: 'alert', hidden: true });
    const submitBtn = h('button', { type: 'submit', class: 'btn btn-primary' }, submitLabel);
    const cancelBtn = h('button', { type: 'button', class: 'btn', onClick: () => modal.close() }, 'Cancel');

    const form = h(
      'form',
      { class: 'form', novalidate: true },
      h('div', { class: 'modal-body' }, h('div', { class: 'form' }, banner, formFields.el)),
      h('div', { class: 'modal-foot' }, cancelBtn, submitBtn),
    );
    form.style.display = 'contents';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      banner.hidden = true;
      formFields.clearErrors();
      const local = formFields.validateRequired();
      if (local) return;
      submitBtn.classList.add('loading');
      submitBtn.disabled = true;
      try {
        result = await onSubmit(formFields.values());
        modal.close();
      } catch (err) {
        const hasDetails = Array.isArray(err.details) && err.details.length > 0;
        const unmatched = hasDetails ? formFields.showErrors(err.details) : [];
        if (!hasDetails || unmatched.length) {
          const text = hasDetails ? unmatched.map((d) => d.message).join(' ') : err.message || 'Something went wrong';
          banner.replaceChildren(icon('alert'), h('span', null, text));
          banner.hidden = false;
        }
      } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
      }
    });

    const modal = openModal({ title, content: form, wide, onClose: () => resolve(result) });
    formFields.focusFirst();
  });
}
