const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHTML } = require('linkedom');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const api = require('../lib/transcript.js');

const cards = `
  <ytd-rich-grid-media><a href="/watch?v=old" id="thumbnail">12:34</a><ytd-channel-name><a id="text" href="/@canal-antigo">Canal Antigo</a></ytd-channel-name>
    <a id="video-title-link" href="/watch?v=old"><yt-formatted-string id="video-title">Título antigo</yt-formatted-string></a></ytd-rich-grid-media>
  <yt-lockup-view-model><a href="/watch?v=new">4:00</a><a href="/channel/UC123">Canal Novo</a>
    <h3><a href="/watch?v=new&list=foo" aria-label="Título novo canal 10 mil views"><span class="yt-core-attributed-string">Título novo</span></a></h3></yt-lockup-view-model>
  <ytd-video-renderer><a id="video-title" title="Resultado da busca" href="/watch?v=search">Resultado da busca</a></ytd-video-renderer>
  <a id="video-title" href="/watch?v=new&t=20">Duplicado</a>
  <a href="/watch?v=empty" aria-label="Canal 30 mil views">10:00</a>
  <a id="video-title" href="https://example.com/watch?v=bad">Externo</a>
  <a id="video-title" href="/shorts/short">Short</a>`;

test('extracts only titles across legacy cards, lockups and search; canonicalizes and deduplicates links', () => {
  const { document } = parseHTML('<html><body>' + cards + '</body></html>');
  assert.deepEqual(api.listingVideos(document), [
    { href: '/watch?v=old', title: 'Título antigo', channel: 'Canal Antigo' },
    { href: '/watch?v=new', title: 'Título novo', channel: 'Canal Novo' },
    { href: '/watch?v=search', title: 'Resultado da busca' }
  ]);
});

function start(pathname = '/', search = '') {
  const { document, window } = parseHTML('<html><head></head><body></body></html>');
  const timers = [];
  vm.runInNewContext(readFileSync(require.resolve('../content.js'), 'utf8'), {
    YouTextTranscript: api, YouTextUI: require('../lib/ui.js'), YouTextWatchLater: { load: async () => ({ videos: [], partial: false }) }, document, location: { pathname, search }, URLSearchParams,
    MutationObserver: window.MutationObserver, console,
    browser: { storage: { onChanged: { addListener() {} }, local: { get: () => ({ then(callback) { callback({}); return { catch() {} }; } }) } } },
    setInterval: (callback) => { timers.push(callback); return timers.length; },
    clearInterval() {}, setTimeout, clearTimeout
  });
  return { document, tick: () => timers.forEach((callback) => callback()) };
}

test('mounts an actual list, handles delayed cards, preserves search input and restores a detached host', () => {
  const { document, tick } = start();
  const host = document.getElementById('youtext-home');
  assert.equal(host.shadowRoot.querySelector('.logo').getAttribute('href'), '/');
  assert.ok(host.shadowRoot.querySelector('.logo svg'));
  assert.equal(host.shadowRoot.querySelector('.logo span'), null);
  assert.equal(host.shadowRoot.querySelector('input').placeholder, 'YouText');
  const root = host.shadowRoot;
  assert.ok(root.querySelector('main ul'));
  assert.ok(root.querySelector('main > [role="status"]').textContent);
  const input = root.querySelector('input');
  input.value = 'Minha pesquisa';
  document.body.innerHTML = cards;
  tick();
  assert.equal(root.querySelectorAll('li').length, 3);
  assert.equal(root.querySelector('li a').textContent, 'Título antigo');
  assert.equal(root.querySelector('li a').getAttribute('href'), '/watch?v=old');
  assert.equal(root.querySelector('li .video-channel').textContent, 'Canal Antigo');
  assert.equal(input.value, 'Minha pesquisa');
  assert.equal(root.querySelector('main > [role="status"]').textContent, '');
  host.remove(); tick();
  assert.equal(document.getElementById('youtext-home'), host);
});

test('search results retain a GET search form and show title links', () => {
  const { document, tick } = start('/results', '?search_query=teste');
  document.body.innerHTML = cards; tick();
  const root = document.getElementById('youtext-home').shadowRoot;
  assert.equal(root.querySelector('form').getAttribute('action'), '/results');
  assert.equal(root.querySelector('form').getAttribute('method'), 'get');
  assert.equal(root.querySelector('input').name, 'search_query');
  assert.equal(root.querySelector('input').value, 'teste');
  assert.equal(root.querySelectorAll('li').length, 3);
});
