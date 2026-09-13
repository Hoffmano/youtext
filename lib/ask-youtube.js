(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.YouTextAskYouTube = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ASK = /\b(?:ask|perguntar|pergunte)\b/i;
  const SEND = /^(?:send|submit|enviar)\b/i;
  const SUMMARIZE = /(?:summari[sz]\w*|summary|resum\w*)/i;
  const PROMPT = 'Summarize this video in concise bullet points. Include only information stated in the video.';

  function deepQueryAll(root, selector) {
    const results = [];
    const visit = (scope) => {
      results.push(...scope.querySelectorAll(selector));
      scope.querySelectorAll('*').forEach((node) => { if (node.shadowRoot) visit(node.shadowRoot); });
    };
    visit(root); return [...new Set(results)];
  }

  function label(node) {
    return (node.getAttribute?.('aria-label') || node.getAttribute?.('title') || node.getAttribute?.('data-tooltip-text') || node.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function describe(node) {
    if (!node) return 'none';
    const id = node.id ? `#${node.id}` : '';
    const classes = typeof node.className === 'string' && node.className.trim()
      ? `.${node.className.trim().replace(/\s+/g, '.').slice(0, 80)}` : '';
    const text = label(node).slice(0, 120);
    return `${(node.localName || node.tagName || 'node').toLowerCase()}${id}${classes}${text ? ` [${text}]` : ''}`;
  }

  function inventory(root, selector, limit = 30) {
    const nodes = deepQueryAll(root, selector).filter((node) => !node.closest?.('main.youtext'));
    return `count=${nodes.length}; ${nodes.slice(0, limit).map(describe).join(' | ') || 'none'}`;
  }

  function tracer(logger = console) {
    const started = Date.now();
    const entries = [];
    const trace = (event, detail = '') => {
      const line = `+${Date.now() - started}ms ${event}${detail ? `: ${detail}` : ''}`;
      entries.push(line);
      logger?.info?.(`[YouText Ask] ${line}`);
    };
    trace.entries = entries;
    return trace;
  }

  function actionNode(node) {
    if (node.matches?.('button, [role="button"]')) return node;
    return deepQueryAll(node, 'button, [role="button"]')[0] || node;
  }

  function closestAcrossRoots(node, selector) {
    for (let current = node; current;) {
      const found = current.closest?.(selector);
      if (found) return found;
      current = current.getRootNode?.().host || null;
    }
    return null;
  }

  function askButton(root) {
    const match = deepQueryAll(root, 'button, [role="button"], yt-button-view-model, button-view-model').find((node) =>
      !node.closest?.('main.youtext') && ASK.test(label(node))
    );
    return match ? actionNode(match) : null;
  }

  function conversationRoot(root, input) {
    return closestAcrossRoots(input, 'ytd-engagement-panel-section-list-renderer[target-id="PAyouchat"], ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-youchat"], ytd-conversational-video-ai-chat-renderer, ytd-conversation-panel-renderer, ytd-engagement-panel-section-list-renderer, yt-sheet-view-model, tp-yt-paper-dialog, [role="dialog"], [aria-modal="true"]') || root;
  }

  function promptInput(root, baseline = new Set()) {
    const inputs = deepQueryAll(root, 'textarea, input:not([type]), input[type="text"], [contenteditable="true"], [role="textbox"]');
    const eligible = inputs.filter((node) => {
      if (node.disabled || node.getAttribute('aria-disabled') === 'true' || node.closest?.('main.youtext, [role="search"], ytd-searchbox, #search')) return false;
      const hint = `${label(node)} ${node.getAttribute('placeholder') || ''}`;
      return !baseline.has(node) || /ask|question|pergunt/i.test(hint);
    });
    return eligible.sort((a, b) => {
      const score = (node) => (/ask|question|pergunt/i.test(`${label(node)} ${node.getAttribute('placeholder') || ''}`) ? 2 : 0) +
        (conversationRoot(root, node) !== root ? 1 : 0);
      return score(b) - score(a);
    })[0] || null;
  }

  function summarySuggestion(root, originalButton) {
    const match = deepQueryAll(root, 'button, [role="button"], yt-chip-cloud-chip-renderer, yt-button-view-model, button-view-model').find((node) =>
      node !== originalButton && !node.closest?.('main.youtext') && SUMMARIZE.test(label(node))
    );
    return match ? actionNode(match) : null;
  }

  function setPrompt(input, prompt) {
    input.focus?.();
    if (input.isContentEditable || input.getAttribute('contenteditable') === 'true') input.textContent = prompt;
    else {
      const view = input.ownerDocument?.defaultView;
      const prototype = input.tagName === 'TEXTAREA' ? view?.HTMLTextAreaElement?.prototype : view?.HTMLInputElement?.prototype;
      const setter = prototype && Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (setter) setter.call(input, prompt);
      else input.value = prompt;
    }
    const EventType = input.ownerDocument?.defaultView?.Event || Event;
    input.dispatchEvent(new EventType('input', { bubbles: true }));
    input.dispatchEvent(new EventType('change', { bubbles: true }));
  }

  function sendControl(panel, input) {
    const candidates = deepQueryAll(panel, 'button, [role="button"], yt-button-view-model, button-view-model')
      .map((node) => actionNode(node)).filter((node, index, all) => all.indexOf(node) === index)
      .filter((node) => !node.disabled && node.getAttribute('aria-disabled') !== 'true');
    const scored = candidates.map((node) => {
      const wrapper = closestAcrossRoots(node, 'button-view-model, yt-button-view-model') || node;
      const identity = `${node.className || ''} ${wrapper.className || ''} ${label(node)} ${label(wrapper)}`;
      if (/promo|gemini|suggestion|chip/i.test(identity)) return { node, score: -1 };
      let score = 0;
      if (/send|submit/i.test(identity)) score += 100;
      if (SEND.test(`${label(node)} ${label(wrapper)}`.trim())) score += 100;
      return { node, score };
    }).filter(({ score }) => score >= 100).sort((a, b) => b.score - a.score);
    return scored[0]?.node || null;
  }

  function responseTexts(root, prompt) {
    const selectors = [
      '[data-message-author-role="assistant"]', '[data-author="assistant"]',
      '[class*="assistant-response"]', '[class*="ai-response"]',
      '[class*="ytChatModelTurn"]', '[class*="ytChatAssistant"]', '[class*="ytwYouChat"]',
      'ytd-conversation-turn-renderer', 'yt-formatted-string'
    ];
    const nodes = deepQueryAll(root, selectors.concat('yt-attributed-string', '.yt-core-attributed-string', '[class*="answer"]', '[aria-live="polite"]', 'p', 'li').join(','));
    const ignored = new Set([prompt, ...deepQueryAll(root, 'button, [role="button"], textarea, input, [role="textbox"]').map(label)]);
    return nodes.map((node) => (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((text, index, all) => text.length >= 40 && !ignored.has(text) && text !== prompt && all.indexOf(text) === index);
  }

  function responseText(root, prompt, baseline = new Set()) {
    return responseTexts(root, prompt).filter((text) => !baseline.has(text)).sort((a, b) => b.length - a.length)[0] || '';
  }

  function waitFor(find, { root, timeout = 20000, current = () => true, timeoutMessage = 'Ask YouTube timed out.' } = {}) {
    return new Promise((resolve, reject) => {
      let observer;
      const finish = (callback, value) => { clearTimeout(timer); clearInterval(poller); observer?.disconnect(); callback(value); };
      const check = () => {
        if (!current()) return finish(reject, new Error('Navigation changed'));
        const value = find();
        if (value) finish(resolve, value);
      };
      const Observer = root.defaultView?.MutationObserver || root.ownerDocument?.defaultView?.MutationObserver || globalThis.MutationObserver;
      observer = new Observer(check);
      observer.observe(root.documentElement || root, { childList: true, subtree: true, characterData: true });
      const timer = setTimeout(() => finish(reject, new Error(timeoutMessage)), timeout);
      const poller = setInterval(check, 250);
      check();
    });
  }

  async function requestSummary(document, { current = () => true, prompt = PROMPT, timeouts = {}, logger = console } = {}) {
    const trace = tracer(logger);
    let phase = 'initialization';
    try {
      const existingInputs = new Set(deepQueryAll(document, 'textarea, input, [contenteditable="true"], [role="textbox"]'));
      trace('start', `lang=${document.documentElement?.lang || 'unknown'}; existingInputs=${existingInputs.size}`);
      phase = 'finding Ask button';
      const button = await waitFor(() => askButton(document), {
        root: document, timeout: timeouts.button ?? 15000, current,
        timeoutMessage: 'Ask YouTube button was not found on this page.'
      });
      trace('button found', describe(button));
      button.click();
      trace('button clicked');
      phase = 'finding question field or summary suggestion';
      const composer = await waitFor(() => {
        const suggestion = summarySuggestion(document, button);
        if (suggestion) return { suggestion };
        const input = promptInput(document, existingInputs);
        return input ? { input } : null;
      }, {
        root: document, timeout: timeouts.composer ?? 15000, current,
        timeoutMessage: 'Ask YouTube opened, but its question field was not found.'
      });
      const anchor = composer.input || composer.suggestion;
      const panel = conversationRoot(document, anchor);
      trace(composer.input ? 'question field found' : 'summary suggestion found', describe(anchor));
      trace('conversation root', describe(panel));
      const baseline = new Set(responseTexts(panel, prompt));
      trace('response baseline', `candidates=${baseline.size}`);
      if (composer.suggestion) {
        composer.suggestion.click();
        trace('summary suggestion clicked');
      } else {
        const input = composer.input;
        setPrompt(input, prompt);
        trace('prompt filled', `characters=${prompt.length}`);
        await new Promise((resolve) => setTimeout(resolve, 100));
        const submit = sendControl(panel, input);
        if (submit) {
          submit.click();
          trace('send control clicked', describe(submit));
        } else {
          const KeyboardEventType = document.defaultView?.KeyboardEvent || globalThis.KeyboardEvent;
          const eventOptions = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
          for (const type of ['keydown', 'keypress', 'keyup']) input.dispatchEvent(new KeyboardEventType(type, eventOptions));
          trace('Enter dispatched', `send control not found; nearby=${inventory(input.parentElement || panel, 'button, [role="button"], yt-button-view-model, button-view-model', 12)}`);
        }
      }
      phase = 'waiting for response';
      let previous = '';
      let stableSince = 0;
      const result = await waitFor(() => {
        const text = responseText(panel, prompt, baseline);
        if (!text) return null;
        if (text !== previous) {
          previous = text;
          stableSince = Date.now();
          trace('response changed', `characters=${text.length}`);
          return null;
        }
        return Date.now() - stableSince >= 750 ? text : null;
      }, { root: panel, timeout: timeouts.response ?? 60000, current, timeoutMessage: 'Ask YouTube did not return a readable response.' });
      trace('success', `characters=${result.length}`);
      return result;
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error(String(caught));
      trace('failure', `phase=${phase}; ${error.message}`);
      trace('interactive controls', inventory(document, 'button, [role="button"], yt-button-view-model, button-view-model'));
      trace('text inputs', inventory(document, 'textarea, input, [contenteditable="true"], [role="textbox"]', 15));
      trace('conversation panels', inventory(document, 'ytd-conversational-video-ai-chat-renderer, ytd-conversation-panel-renderer, ytd-engagement-panel-section-list-renderer, yt-sheet-view-model, tp-yt-paper-dialog, [role="dialog"]', 15));
      const chatPanel = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id="PAyouchat"], ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-youchat"]');
      if (chatPanel) trace('chat panel controls', inventory(chatPanel, 'button, [role="button"], yt-button-view-model, button-view-model', 30));
      error.youtextDiagnostics = trace.entries.join('\n');
      logger?.warn?.('[YouText Ask] diagnostic log\n' + error.youtextDiagnostics);
      throw error;
    }
  }

  return { PROMPT, askButton, promptInput, requestSummary, responseText, sendControl, setPrompt, summarySuggestion };
});
