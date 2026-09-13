const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');
const { parseHTML } = require('linkedom');

async function page(settings) {
  const { document, window } = parseHTML('<html><head></head><body><video></video></body></html>');
  document.querySelector('video').pause = () => {};
  let listener;
  let reloads = 0;
  let timers = 0;
  vm.runInNewContext(readFileSync(require.resolve('../content.js'), 'utf8'), {
    document, console, URLSearchParams, MutationObserver: window.MutationObserver,
    YouTextTranscript: require('../lib/transcript.js'), YouTextUI: require('../lib/ui.js'),
    location: { pathname: '/', search: '', reload() { reloads++; } },
    setInterval() { timers++; },
    browser: { storage: {
      local: { get: async () => settings, set: async (values) => Object.assign(settings, values) },
      onChanged: { addListener(callback) { listener = callback; } }
    } }
  });
  await new Promise(setImmediate);
  return { document, change: (value) => listener({ youtextEnabled: { newValue: value } }, 'local'), reloads: () => reloads, timers: () => timers };
}

test('disabled extension leaves YouTube intact and reloads once when enabled', async () => {
  const state = await page({ youtextEnabled: false });
  assert.equal(state.document.querySelector('#youtext-home'), null);
  assert.equal(state.document.querySelector('#youtext-preload'), null);
  assert.ok(state.document.querySelector('video'));
  assert.ok(state.document.querySelector('#youtext-native-toggle'));
  assert.equal(state.timers(), 0);
  state.change(false);
  assert.equal(state.reloads(), 0);
  state.change(true); state.change(true);
  assert.equal(state.reloads(), 1);
});

test('enabled by default and disabling reloads to restore the native page', async () => {
  const state = await page({});
  assert.ok(state.document.querySelector('#youtext-home'));
  assert.equal(state.timers(), 2);
  state.change(false);
  assert.equal(state.reloads(), 1);
});
