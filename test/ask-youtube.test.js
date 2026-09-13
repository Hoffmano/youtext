const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHTML } = require('linkedom');
const api = require('../lib/ask-youtube.js');

test('finds the native Ask YouTube action outside YouText', () => {
  const { document } = parseHTML('<main class="youtext"><button>Ask</button></main><button aria-label="Perguntar">✨</button>');
  assert.equal(api.askButton(document).getAttribute('aria-label'), 'Perguntar');
});

test('finds Ask inside a current YouTube button view model', () => {
  const { document } = parseHTML('<yt-button-view-model title="✨ Ask about this video"><button id="native"></button></yt-button-view-model>');
  assert.equal(api.askButton(document).id, 'native');
});

test('does not reuse the pre-existing YouTube search field as the prompt', () => {
  const { document } = parseHTML('<div role="search"><input id="search" type="text"></div><div role="dialog"><input id="ask-input" aria-label="Ask about this video"></div>');
  const baseline = new Set([document.querySelector('#search')]);
  assert.equal(api.promptInput(document, baseline).id, 'ask-input');
});

test('chooses the send control next to the input and rejects the Gemini promo', () => {
  const { document } = parseHTML('<div target-id="PAyouchat"><div class="input-row"><textarea></textarea><button-view-model class="chatInputViewModelPromoButton"><button>Ask about Gemini</button></button-view-model><button-view-model class="chatInputViewModelSendButton"><button id="send"></button></button-view-model></div></div>');
  const panel = document.querySelector('[target-id]');
  assert.equal(api.sendControl(panel, panel.querySelector('textarea')).id, 'send');
});

test('does not treat the Gemini promo as a send control', () => {
  const { document } = parseHTML('<div><textarea></textarea><button-view-model class="chatInputViewModelPromoButton"><button>Pergunte sobre Gemini</button></button-view-model></div>');
  assert.equal(api.sendControl(document, document.querySelector('textarea')), null);
});

test('fills the prompt and extracts a sufficiently detailed AI response', () => {
  const { document } = parseHTML('<div role="dialog"><textarea></textarea><button>Enviar</button><yt-formatted-string>Este é um resumo detalhado do conteúdo apresentado ao longo do vídeo para o usuário.</yt-formatted-string></div>');
  const input = document.querySelector('textarea');
  api.setPrompt(input, api.PROMPT);
  assert.equal(input.value, api.PROMPT);
  assert.match(api.responseText(document.querySelector('[role="dialog"]'), api.PROMPT), /resumo detalhado/);
});

test('ignores the submitted prompt when looking for the response', () => {
  const { document } = parseHTML(`<div role="dialog"><textarea>${api.PROMPT}</textarea><yt-formatted-string>${api.PROMPT}</yt-formatted-string></div>`);
  assert.equal(api.responseText(document, api.PROMPT), '');
});

test('ignores text that was already present before submitting', () => {
  const { document } = parseHTML('<div><yt-formatted-string>This is a sufficiently long explanatory disclaimer shown before the answer.</yt-formatted-string><yt-formatted-string>This is the newly generated summary of the video and its central argument.</yt-formatted-string></div>');
  const baseline = new Set(['This is a sufficiently long explanatory disclaimer shown before the answer.']);
  assert.match(api.responseText(document, api.PROMPT, baseline), /newly generated summary/);
});

test('opens Ask, submits the prompt and returns the generated response', async () => {
  const { document } = parseHTML('<html><body><button id="ask">Ask</button></body></html>');
  document.querySelector('#ask').onclick = () => {
    const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog');
    dialog.innerHTML = '<textarea></textarea><button id="send">Send</button>';
    dialog.querySelector('#send').onclick = () => {
      const response = document.createElement('yt-formatted-string');
      response.textContent = 'The generated summary explains the main claim and the supporting details from the video.';
      dialog.append(response);
    };
    document.body.append(dialog);
  };
  const summary = await api.requestSummary(document);
  assert.match(summary, /generated summary/);
  assert.equal(document.querySelector('textarea').value, api.PROMPT);
});

test('uses the native summarize suggestion when the panel has no text field', async () => {
  const { document } = parseHTML('<html><body><div role="search"><input type="text"></div><button id="ask">Ask</button></body></html>');
  document.querySelector('#ask').onclick = () => {
    const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog');
    dialog.innerHTML = '<button id="summarize">Summarize this video</button>';
    dialog.querySelector('#summarize').onclick = () => {
      const response = document.createElement('yt-formatted-string');
      response.textContent = 'This generated response summarizes the important points contained in the selected video.';
      dialog.append(response);
    };
    document.body.append(dialog);
  };
  assert.match(await api.requestSummary(document), /important points/);
});

test('prefers the safe native summary suggestion over free-text submission', async () => {
  const { document } = parseHTML('<html><body><button id="ask">Perguntar</button></body></html>');
  document.querySelector('#ask').onclick = () => {
    const panel = document.createElement('ytd-engagement-panel-section-list-renderer'); panel.setAttribute('target-id', 'PAyouchat');
    panel.innerHTML = '<textarea placeholder="Faça uma pergunta..."></textarea><button id="summary">Resuma este vídeo</button>';
    panel.querySelector('#summary').onclick = () => {
      const response = document.createElement('div'); response.className = 'ytChatModelTurnViewModelText';
      response.textContent = 'Este é o resumo seguro gerado diretamente pela sugestão nativa disponível no painel.';
      panel.append(response);
    };
    document.body.append(panel);
  };
  assert.match(await api.requestSummary(document), /resumo seguro/);
  assert.equal(document.querySelector('textarea').value, '');
});

test('attaches a copyable staged diagnostic when Ask cannot be found', async () => {
  const { document } = parseHTML('<html lang="pt-BR"><body><button>Compartilhar</button><input type="text"></body></html>');
  await assert.rejects(
    api.requestSummary(document, { timeouts: { button: 5 }, logger: { info() {}, warn() {} } }),
    (error) => {
      assert.match(error.youtextDiagnostics, /phase=finding Ask button/);
      assert.match(error.youtextDiagnostics, /Compartilhar/);
      assert.match(error.youtextDiagnostics, /text inputs: count=1/);
      return true;
    }
  );
});
