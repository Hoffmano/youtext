const field = document.getElementById('api-key');
const status = document.getElementById('status');
const save = document.querySelector('#settings button');

browser.storage.local.get('geminiApiKey').then(({ geminiApiKey }) => {
  field.value = geminiApiKey || '';
}).catch((error) => { status.textContent = error.message; });
document.getElementById('settings').addEventListener('submit', async (event) => {
  event.preventDefault();
  globalThis.YouTextUI.setLoading(save, true);
  try {
    const geminiApiKey = field.value.trim();
    if (geminiApiKey) await browser.storage.local.set({ geminiApiKey });
    else await browser.storage.local.remove('geminiApiKey');
    status.textContent = geminiApiKey ? 'Settings saved locally.' : 'Settings saved. Key removed.';
  } catch (error) {
    status.textContent = error.message || 'Could not save settings.';
  } finally { globalThis.YouTextUI.setLoading(save, false); }
});
