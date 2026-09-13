(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.YouTextUI = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  const loadingStates = new WeakMap();
  const toastTimers = new WeakMap();

  function iconButton(document, { icon, label, type = 'button', className = '', id = '' }) {
    if (!label) throw new Error('Icon buttons require an accessible label.');
    const button = document.createElement('button');
    button.type = type;
    button.className = ['icon-button', className].filter(Boolean).join(' ');
    button.textContent = icon;
    button.title = label;
    button.setAttribute('aria-label', label);
    if (id) button.id = id;
    return button;
  }

  function setLoading(button, loading) {
    if (!button) return;
    if (loading) {
      if (!loadingStates.has(button)) loadingStates.set(button, { disabled: button.disabled, ariaBusy: button.getAttribute('aria-busy') });
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.classList.add('is-loading');
      return;
    }
    const previous = loadingStates.get(button);
    button.disabled = previous?.disabled || false;
    if (previous?.ariaBusy == null) button.removeAttribute('aria-busy');
    else button.setAttribute('aria-busy', previous.ariaBusy);
    button.classList.remove('is-loading');
    loadingStates.delete(button);
  }

  function toast(document, message, type = 'info', duration = 3500) {
    const home = document.getElementById('youtext-home')?.shadowRoot;
    const parent = home?.querySelector('main') || document.querySelector('main.youtext') || document.body;
    if (!parent) return;
    let region = parent.querySelector('.youtext-toasts');
    if (!region) {
      region = document.createElement('div');
      region.className = 'youtext-toasts';
      region.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
      region.setAttribute('aria-atomic', 'true');
      parent.append(region);
    }
    const previous = region.querySelector('.youtext-toast');
    if (previous) {
      clearTimeout(toastTimers.get(previous));
      previous.remove();
    }
    const node = document.createElement('div');
    node.className = `youtext-toast youtext-toast-${type}`;
    node.setAttribute('role', type === 'error' ? 'alert' : 'status');
    node.textContent = message;
    region.append(node);
    const timer = setTimeout(() => { node.remove(); if (!region.children.length) region.remove(); }, duration);
    toastTimers.set(node, timer);
    return node;
  }

  return { iconButton, setLoading, toast };
});
