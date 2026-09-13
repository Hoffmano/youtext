const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHTML } = require('linkedom');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

function capturePage(body, cachedSummary = null) {
  const { document, window } = parseHTML(`<html><head></head><body>${body}</body></html>`);
  const source = readFileSync(require.resolve('../content.js'), 'utf8').replace('  initialize();', '  globalThis.capture = openNativeTranscript; globalThis.show = showTranscript;');
  const context = vm.createContext({
    crypto: require('node:crypto').webcrypto,
    document, YouTextTranscript: require('../lib/transcript.js'), YouTextUI: require('../lib/ui.js'), console,
    location: { pathname: '/watch', search: '?v=current' }, URLSearchParams,
    MutationObserver: window.MutationObserver,
    setInterval, clearInterval, setTimeout, clearTimeout,
    browser: {
      storage: { local: { get: async () => ({}), set: async () => {} } },
      runtime: {
        sendMessage: async (message) => message.type === 'youtext:cached-summary' ? cachedSummary : [],
        connect: () => {
          const listeners = [];
          return {
            onMessage: { addListener: fn => listeners.push(fn), removeListener: () => {} },
            onDisconnect: { addListener: () => {}, removeListener: () => {} },
            postMessage: () => queueMicrotask(() => listeners.forEach(fn => fn({ type: 'result', result: { bullets: ['Generated.'] } }))),
            disconnect() {}
          };
        }
      }
    }
  });
  // The perpetual player/home timers are irrelevant to capture tests.
  vm.runInContext(source.replace('  setInterval(pausePlayers, 250);', '').replace("  setInterval(() => { if (location.pathname === '/' || location.pathname === '/results') showHome(); }, 500);", ''), context);
  return { document, context };
}

test('reads an already open transcript without clicking its toggle', async () => {
  const { document, context } = capturePage('<button>Mostrar transcrição</button><ytd-transcript-segment-renderer><span class="segment-text">Texto existente</span></ytd-transcript-segment-renderer>');
  document.querySelector('button').onclick = () => { throw new Error('Should not toggle an open transcript'); };
  assert.deepEqual(Array.from(await context.capture(() => true)), ['Texto existente']);
});

test('expands description and waits for populated transcript text', async () => {
  const { document, context } = capturePage('<ytd-watch-metadata><div id="description-inline-expander"><button id="expand">Mais</button></div></ytd-watch-metadata>');
  document.querySelector('#expand').onclick = () => {
    const button = document.createElement('button'); button.textContent = 'Mostrar transcrição';
    button.onclick = () => {
      const segment = document.createElement('ytd-transcript-segment-renderer');
      document.body.append(segment);
      setTimeout(() => { segment.textContent = 'Texto carregado'; }, 10);
    };
    document.body.append(button);
  };
  assert.deepEqual(Array.from(await context.capture(() => true)), ['Texto carregado']);
});

test('repeated navigation events only open the transcript once', async () => {
  const { document, context } = capturePage('<button>Mostrar transcrição</button>');
  let clicks = 0;
  document.querySelector('button').onclick = () => { clicks++; };
  // Cancel after checking concurrency, without waiting for the capture timeout.
  const first = context.show('current');
  await context.show('current');
  assert.equal(clicks, 1);
  context.location.search = '?v=other';
  document.body.append(document.createElement('div'));
  await first;
});

test('cached summary renders without opening the native transcript', async () => {
  const { document, context } = capturePage('<button>Mostrar transcrição</button>', { bullets: ['Cached.'] });
  let clicks = 0;
  document.querySelector('button').onclick = () => { clicks++; };
  await context.show('current');
  assert.equal(clicks, 0);
  assert.equal(document.querySelector('.summary-result li').textContent, 'Cached.');
});

test('missing cache still opens and renders the native transcript', async () => {
  const { document, context } = capturePage('<button>Mostrar transcrição</button>');
  let clicks = 0;
  document.querySelector('button').onclick = () => {
    clicks++;
    const segment = document.createElement('ytd-transcript-segment-renderer');
    segment.textContent = 'Loaded without cache';
    document.body.append(segment);
  };
  await context.show('current');
  assert.equal(clicks, 1);
  assert.equal(document.querySelector('.speech').textContent, 'Loaded without cache');
});

test('video starts collapsed, links home and recommendations, and generates an article independently', async () => {
  const { document, window } = parseHTML('<html><head></head><body></body></html>');
  window.HTMLSelectElement.prototype.add = function (option) { this.append(option); };
  const messages = [];
  const source = readFileSync(require.resolve('../content.js'), 'utf8').replace('  initialize();', '  globalThis.renderVideo = render;');
  const context = vm.createContext({
    crypto: require('node:crypto').webcrypto,
    document, YouTextTranscript: require('../lib/transcript.js'), YouTextUI: require('../lib/ui.js'),
    location: { pathname: '/watch', search: '?v=current' }, URLSearchParams,
    MutationObserver: window.MutationObserver, setInterval() {},
    Option: function (label, value) { const option = document.createElement('option'); option.textContent = label; option.value = value; return option; },
    browser: { storage: { local: { get: async () => ({}), set: async () => {} } }, runtime: { connect: () => {
      const messageListeners = [], disconnectListeners = [];
      return {
        onMessage: { addListener: fn => messageListeners.push(fn), removeListener: fn => messageListeners.splice(messageListeners.indexOf(fn), 1) },
        onDisconnect: { addListener: fn => disconnectListeners.push(fn), removeListener: fn => disconnectListeners.splice(disconnectListeners.indexOf(fn), 1) },
        postMessage(message) {
          messages.push(message);
          const result = message.type === 'youtext:article' ? { paragraphs: ['Detalhes do vídeo.', '<script>texto seguro</script>'] } : { bullets: ['Resumo do vídeo.'] };
          queueMicrotask(() => messageListeners.forEach(fn => fn({ type: 'result', result })));
        },
        disconnect() {}
      };
    }, sendMessage: async (message) => {
      messages.push(message);
      if (message.type === 'youtext:models') return [];
    } } }
  });
  vm.runInContext(source, context);
  context.renderVideo({ title: 'VÍDEO MUITO BOM', channel: 'CANAL COM CASE MISTO', paragraphs: ['Transcrição original.'], recommendations: [{ href: '/watch?v=next', title: 'Próximo vídeo', channel: 'Canal recomendado' }] });
  await new Promise(setImmediate);
  assert.equal(document.querySelector('.brand').getAttribute('href'), '/');
  assert.equal(document.querySelector('.brand').getAttribute('aria-label'), 'YouText home');
  assert.ok(document.querySelector('.brand svg'));
  assert.equal(document.querySelector('.brand span'), null);
  assert.equal(document.querySelector('.search-form input').placeholder, 'YouText');
  assert.equal(document.querySelector('.topbar').children.length, 3);
  assert.equal(document.querySelector('.topbar').firstElementChild.className, 'logo brand');
  assert.equal(document.querySelector('.topbar').children[1].tagName, 'FORM');
  assert.equal(document.querySelectorAll('.preference-switch').length, 2);
  assert.equal(document.querySelector('h1').textContent, 'Vídeo muito bom');
  assert.equal(document.querySelector('.channel').textContent, 'Canal com case misto');
  assert.equal(document.querySelector('header').nextElementSibling.className, 'summary');
  assert.equal(document.title, 'Vídeo muito bom · YouText');
  assert.equal(document.querySelector('details').hasAttribute('open'), false);
  assert.equal(document.querySelector('.speech').textContent, 'Transcrição original.');
  const typography = Array.from(document.querySelectorAll('style')).map(style => style.textContent).join('');
  assert.match(typography, /font:18px\/1\.6 "Atkinson Hyperlegible",Verdana,Arial,sans-serif/);
  assert.match(typography, /100vw - 70ch/);
  assert.doesNotMatch(typography, /text-transform:uppercase|Georgia,serif/);
  assert.equal(document.querySelector('.video-list a').getAttribute('href'), '/watch?v=next');
  assert.equal(document.querySelector('.video-list .video-channel').textContent, 'Canal recomendado');
  const buttons = document.querySelectorAll('.summary-action');
  assert.equal(document.querySelector('.summary select'), null);
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].title, 'Read more');
  assert.equal(buttons[0].getAttribute('aria-label'), 'Read more');
  assert.equal(document.querySelector('.summary').lastElementChild, buttons[0].parentElement);
  buttons[0].click(); await new Promise(setImmediate);
  assert.equal(messages.at(-1).type, 'youtext:article');
  assert.equal(document.querySelector('.summary-result li').textContent, 'Resumo do vídeo.');
  assert.equal(document.querySelectorAll('.article-result p').length, 2);
  assert.equal(document.querySelector('.article-result script'), null);
  assert.equal(buttons[0].disabled, false);
});

test('disconnected extension offers page reload during generation', async () => {
    const { document, window } = parseHTML('<html><head></head><body></body></html>');
    window.HTMLSelectElement.prototype.add = function (option) { this.append(option); };
    let reloads = 0;
    const disconnected = () => { throw new Error('Could not establish connection. Receiving end does not exist.'); };
    const context = vm.createContext({
      document, crypto: require('node:crypto').webcrypto, YouTextUI: require('../lib/ui.js'),
      location: { reload() { reloads++; } }, setInterval() {},
      Option: function (label, value) { const option = document.createElement('option'); option.textContent = label; option.value = value; return option; },
      browser: { runtime: {
        connect: disconnected,
        sendMessage: disconnected
      } }
    });
    const source = readFileSync(require.resolve('../content.js'), 'utf8').replace('  initialize();', '  globalThis.panel = summaryPanel;');
    vm.runInContext(source, context);
    document.body.append(context.panel(['Transcrição preservada.']));
    await new Promise(setImmediate);
    const output = document.querySelector('.summary-status');
    assert.match(output.textContent, /YouText lost its connection/);
    assert.doesNotMatch(output.textContent, /Receiving end/);
    const controls = document.querySelector('.summary-actions');
    assert.equal(controls.querySelectorAll('button').length, 2);
    controls.querySelector('[aria-label="Reload page"]').click();
    assert.equal(reloads, 1);
    assert.equal(document.querySelector('.summary-action').disabled, false);
  });
