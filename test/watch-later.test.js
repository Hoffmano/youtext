const test = require('node:test');
const assert = require('node:assert/strict');
const { initialData, playlist } = require('../lib/watch-later.js');
const { parseHTML } = require('linkedom');
const vm = require('node:vm');
const { readFileSync } = require('node:fs');

test('parses embedded data without executing scripts and preserves quoted braces', () => {
  const data = { text: 'Exemplo "{teste}"', nested: { value: 1 } };
  assert.deepEqual(initialData(`<script>var ytInitialData = ${JSON.stringify(data)}; dangerous();</script>`), data);
  assert.deepEqual(initialData(`<script>window["ytInitialData"] = ${JSON.stringify(data)};</script>`), data);
  assert.throws(() => initialData('<html>Login</html>'), /session/);
});

test('extracts playlist order, skips unavailable entries and reports continuation', () => {
  const data = { contents: { playlistVideoListRenderer: { contents: [
    { playlistVideoRenderer: { videoId: 'b', title: { runs: [{ text: 'Segundo' }] }, shortBylineText: { runs: [{ text: 'Canal B' }] } } },
    { playlistVideoRenderer: { videoId: 'a', title: { simpleText: 'Primeiro' }, ownerText: { simpleText: 'Canal A' } } },
    { playlistVideoRenderer: { videoId: 'hidden', title: { simpleText: 'Privado' }, isPlayable: false } },
    { continuationItemRenderer: {} }
  ] } }, unrelated: { playlistVideoRenderer: { videoId: 'other', title: { simpleText: 'Outro' } } } };
  assert.deepEqual(playlist(data), { videos: [{ href: '/watch?v=b', title: 'Segundo', channel: 'Canal B' }, { href: '/watch?v=a', title: 'Primeiro', channel: 'Canal A' }], partial: true });
  assert.deepEqual(playlist({ playlistVideoListRenderer: { contents: [] } }), { videos: [], partial: false });
  assert.throws(() => playlist({ error: 'Login required' }), /signed in/);
});

test('preserves YouTube removal command for a Read later item', () => {
  const removeAction = { commandMetadata: { webCommandMetadata: { apiUrl: '/youtubei/v1/browse/edit_playlist' } }, playlistEditEndpoint: { playlistId: 'WL', actions: [{ action: 'ACTION_REMOVE_VIDEO', setVideoId: 'set-1' }] } };
  const data = { playlistVideoListRenderer: { contents: [{ playlistVideoRenderer: {
    videoId: 'a', title: { simpleText: 'Saved' }, menu: { menuRenderer: { items: [{ menuServiceItemRenderer: { serviceEndpoint: removeAction } }] } }
  } }] } };
  assert.deepEqual(playlist(data).videos[0].removeAction, removeAction);
});

test('loads watch later above recommendations only on home', async () => {
  for (const pathname of ['/', '/results']) {
    const { document, window } = parseHTML('<html><head></head><body></body></html>');
    let calls = 0;
    vm.runInNewContext(readFileSync(require.resolve('../content.js'), 'utf8'), {
      document, console, URLSearchParams, location: { pathname, search: '' },
      MutationObserver: window.MutationObserver, setInterval() {},
      YouTextTranscript: require('../lib/transcript.js'), YouTextUI: require('../lib/ui.js'),
      YouTextWatchLater: { load: async () => { calls++; return { videos: [{ href: '/watch?v=saved', title: 'SALVO', channel: 'Canal salvo' }], partial: false }; } },
      browser: { storage: { onChanged: { addListener() {} }, local: { get: async () => ({}) } } }
    });
    await new Promise(setImmediate);
    const root = document.getElementById('youtext-home').shadowRoot;
    if (pathname === '/') {
      assert.equal(root.querySelector('.watch-later').className, 'watch-later');
      assert.equal(root.querySelector('.watch-later li a').textContent, 'Salvo');
      assert.equal(root.querySelector('.watch-later li a').getAttribute('href'), '/watch?v=saved');
      assert.equal(root.querySelector('.watch-later .video-channel').textContent, 'Canal salvo');
      assert.equal(root.querySelector('.watch-later li').lastElementChild.getAttribute('aria-label'), 'Remove from Read later: SALVO');
      assert.equal(root.querySelector('[aria-label="Refresh Read later"]'), null);
      assert.equal(calls, 1);
    } else {
      assert.equal(root.querySelector('.watch-later'), null);
      assert.equal(calls, 0);
    }
  }
});
