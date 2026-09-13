const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHTML } = require('linkedom');
const { watched, reactionState, markRead, isRead } = require('../lib/feedback.js');

test('reads active like and dislike state from native controls', () => {
  const { document } = parseHTML('<button aria-pressed="true" aria-label="Like this video"></button><button aria-pressed="false" aria-label="Dislike this video"></button>');
  assert.deepEqual(reactionState(document), { like: true, dislike: false });
});

test('persists and restores read state', async () => {
  const stored = {};
  global.browser = { storage: { local: {
    get: async () => stored,
    set: async (values) => Object.assign(stored, values)
  } } };
  assert.equal(await isRead('video-1'), false);
  await markRead('video-1');
  assert.equal(await isRead('video-1'), true);
  delete global.browser;
});

test('sends not interested and already watched through the matching native card', async () => {
  const { document } = parseHTML('<html><body><ytd-rich-item-renderer><a href="/watch?v=target">Video</a><ytd-menu-renderer><button>Menu</button></ytd-menu-renderer></ytd-rich-item-renderer></body></html>');
  const actions = [];
  const card = document.querySelector('ytd-rich-item-renderer');
  card.querySelector('button').onclick = () => {
    actions.push('menu');
    const item = document.createElement('ytd-menu-service-item-renderer'); item.textContent = 'Não tenho interesse';
    item.onclick = () => {
      actions.push('not interested');
      const why = document.createElement('button'); why.textContent = 'Diga o motivo';
      why.onclick = () => {
        const dialog = document.createElement('tp-yt-paper-dialog');
        const checkbox = document.createElement('tp-yt-paper-checkbox'); checkbox.textContent = 'Já assisti ao vídeo';
        checkbox.onclick = () => { actions.push('watched'); checkbox.setAttribute('aria-checked', 'true'); };
        const submit = document.createElement('button'); submit.textContent = 'Enviar';
        submit.onclick = () => { actions.push('submit'); dialog.remove(); };
        dialog.append(checkbox, submit); document.body.append(dialog);
      };
      card.append(why);
    };
    document.body.append(item);
  };
  await watched(document, '/watch?v=target');
  assert.deepEqual(actions, ['menu', 'not interested', 'watched', 'submit']);
});

test('does not operate on another video when the requested card is missing', async () => {
  const { document } = parseHTML('<html><body><ytd-rich-item-renderer><a href="/watch?v=other">Other</a><ytd-menu-renderer><button>Menu</button></ytd-menu-renderer></ytd-rich-item-renderer></body></html>');
  document.querySelector('button').onclick = () => assert.fail('Wrong video');
  await assert.rejects(watched(document, '/watch?v=missing'), /video menu is unavailable/);
});

test('finds the reason after YouTube replaces a card, ignoring older dismissals and unrelated dialogs', async () => {
  const { document } = parseHTML('<html><body><button id="old">Diga o motivo</button><tp-yt-paper-dialog id="unrelated">Outro diálogo</tp-yt-paper-dialog><yt-lockup-view-model><a href="/watch?v=target">Video</a><button aria-haspopup="true">Menu</button></yt-lockup-view-model></body></html>');
  document.querySelector('#old').onclick = () => assert.fail('Must not act on an older dismissal');
  let submitted = false;
  const card = document.querySelector('yt-lockup-view-model');
  card.querySelector('button').onclick = () => {
    const item = document.createElement('div'); item.setAttribute('role', 'menuitem'); item.textContent = 'Não tenho interesse';
    item.onclick = () => {
      const replacement = document.createElement('ytd-notification-multi-action-renderer');
      replacement.innerHTML = '<yt-button-view-model><button>Informar o motivo</button></yt-button-view-model>';
      card.replaceWith(replacement);
      replacement.querySelector('button').onclick = () => {
        const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog');
        dialog.innerHTML = '<label><input type="checkbox">Já assisti ao vídeo</label><button>Enviar</button>';
        let checked = false;
        dialog.querySelector('label').onclick = () => { checked = true; };
        dialog.querySelector('button').onclick = () => { assert.equal(checked, true); submitted = true; dialog.setAttribute('aria-hidden', 'true'); };
        document.body.append(dialog);
      };
    };
    document.body.append(item);
  };
  await watched(document, '/watch?v=target');
  assert.equal(submitted, true);
});
