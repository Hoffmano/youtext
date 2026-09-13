const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHTML } = require('linkedom');
const { iconButton, setLoading, toast } = require('../lib/ui.js');

test('creates a standardized icon button with tooltip and accessible name', () => {
  const { document } = parseHTML('<html></html>');
  const button = iconButton(document, { icon: '↻', label: 'Refresh', type: 'submit', className: 'extra', id: 'refresh' });
  assert.equal(button.textContent, '↻');
  assert.equal(button.title, 'Refresh');
  assert.equal(button.getAttribute('aria-label'), 'Refresh');
  assert.equal(button.type, 'submit');
  assert.equal(button.id, 'refresh');
  assert.ok(button.classList.contains('icon-button'));
  assert.ok(button.classList.contains('extra'));
});

test('rejects an icon button without an accessible label', () => {
  const { document } = parseHTML('<html></html>');
  assert.throws(() => iconButton(document, { icon: '×' }), /accessible label/);
});

test('shows and clears an accessible loading state without losing button content', () => {
  const { document } = parseHTML('<html></html>');
  const button = iconButton(document, { icon: '↻', label: 'Refresh' });
  setLoading(button, true);
  assert.equal(button.disabled, true);
  assert.equal(button.getAttribute('aria-busy'), 'true');
  assert.ok(button.classList.contains('is-loading'));
  assert.equal(button.textContent, '↻');
  setLoading(button, false);
  assert.equal(button.disabled, false);
  assert.equal(button.hasAttribute('aria-busy'), false);
  assert.equal(button.classList.contains('is-loading'), false);
  assert.equal(button.textContent, '↻');
});

test('shows one accessible temporary toast at a time', () => {
  const { document } = parseHTML('<html><body><main class="youtext"></main></body></html>');
  toast(document, 'Saved', 'success', 1000);
  assert.equal(document.querySelector('.youtext-toast').textContent, 'Saved');
  assert.equal(document.querySelector('.youtext-toast').getAttribute('role'), 'status');
  toast(document, 'Failed', 'error', 1000);
  assert.equal(document.querySelectorAll('.youtext-toast').length, 1);
  assert.equal(document.querySelector('.youtext-toast').getAttribute('role'), 'alert');
});
