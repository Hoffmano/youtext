const enabled = document.getElementById('enabled');
const status = document.getElementById('status');
const settings = globalThis.YouTextUI.iconButton(document, { icon: '⚙', label: 'Settings', id: 'settings' });
document.getElementById('settings-action').append(settings);
function describe() {
  status.textContent = enabled.checked ? 'Active. Videos open in YouText.' : 'Disabled. YouTube works normally.';
}
browser.storage.local.get('youtextEnabled').then(({ youtextEnabled }) => {
  enabled.checked = youtextEnabled !== false;
  enabled.disabled = false;
  describe();
}).catch((error) => { status.textContent = error.message; });
enabled.addEventListener('change', async () => {
  enabled.disabled = true;
  try {
    await browser.storage.local.set({ youtextEnabled: enabled.checked });
    describe();
  } catch (error) {
    enabled.checked = !enabled.checked;
    status.textContent = error.message || 'Could not save.';
  } finally { enabled.disabled = false; }
});
settings.addEventListener('click', () => browser.runtime.openOptionsPage());
