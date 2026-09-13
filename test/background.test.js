const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const api = require('../lib/summary.js');

function client(responses) {
  const requests = [];
  const context = vm.createContext({
    YouTextSummary: api, AbortController, setTimeout, clearTimeout,
    YouTextModelFallback: { id: (model) => model, withFallback: (models, call) => call(models[0]) },
    browser: { runtime: { onMessage: { addListener() {} }, onConnect: { addListener() {} } } },
    fetch: async (url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, json: async () => responses.shift() };
    }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), context);
  return { generate: () => vm.runInContext('createClient("test", ["model"]).generate("summarize", "transcript")', context), requests };
}
const valid = { candidates: [{ finishReason: 'STOP', content: { parts: [
  { thought: true, text: 'private reasoning' }, { text: '["a","b",' }, { text: '"c","d","e","f"]' }
] } }] };

test('article instruction always requests English output', () => {
  const context = vm.createContext({
    YouTextSummary: api, YouTextModelFallback: {}, AbortController, setTimeout, clearTimeout,
    browser: { runtime: { onMessage: { addListener() {} }, onConnect: { addListener() {} } } }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), context);
  assert.match(vm.runInContext('ARTICLE_INSTRUCTION', context), /article in English/);
  assert.match(vm.runInContext('ARTICLE_INSTRUCTION', context), /Translate .* into natural English/);
});

test('summary chooses its bullet count and only suggests actions when useful', () => {
  const context = vm.createContext({
    YouTextSummary: api, YouTextModelFallback: {}, AbortController, setTimeout, clearTimeout,
    browser: { runtime: { onMessage: { addListener() {} }, onConnect: { addListener() {} } } }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), context);
  const instruction = vm.runInContext('SUMMARY_INSTRUCTION', context);
  assert.match(instruction, /no fixed limit/);
  assert.match(instruction, /only essential, relevant conclusions/);
  assert.match(instruction, /If useful reader actions/);
});

test('uses a successful cached model for 24 hours, then resets preference', () => {
  const context = vm.createContext({
    YouTextSummary: api, YouTextModelFallback: { id: model => model.name }, AbortController, setTimeout, clearTimeout,
    browser: { runtime: { onMessage: { addListener() {} }, onConnect: { addListener() {} } } }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), context);
  const models = [{ name: 'first' }, { name: 'last-good' }];
  context.models = models;
  assert.equal(vm.runInContext(`cachedModel({ id: 'last-good', savedAt: 1000 }, models, 1000 + MODEL_CACHE_TTL - 1)`, context), 'last-good');
  assert.equal(vm.runInContext(`cachedModel({ id: 'last-good', savedAt: 1000 }, models, 1000 + MODEL_CACHE_TTL)`, context), '');
});

test('generates once and combines non-thought text parts', async () => {
  const { generate, requests } = client([valid]);
  assert.deepEqual(await generate(), ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.deepEqual(requests.map((r) => r.generationConfig.maxOutputTokens), [8192]);
  assert.equal(requests[0].generationConfig.responseMimeType, 'application/json');
  assert.equal(requests[0].generationConfig.responseSchema.minItems, 1);
  assert.equal(requests[0].generationConfig.responseSchema.maxItems, undefined);
});

test('malformed JSON fails without calling the model again', async () => {
  const invalid = { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '["unfinished' }] } }] };
  const { generate, requests } = client([invalid, invalid]);
  await assert.rejects(generate(), /incomplete or invalid summary/);
  assert.equal(requests.length, 1);
});


test('explicit model handles counting and generation without automatic fallback', async () => {
  const urls = [];
  const context = vm.createContext({
    YouTextSummary: api, AbortController, setTimeout, clearTimeout,
    YouTextModelFallback: {
      id: (model) => model.name,
      withFallback() { throw new Error('Automatic fallback must not run'); }
    },
    browser: { runtime: { onMessage: { addListener() {} }, onConnect: { addListener() {} } } },
    fetch: async (url) => {
      urls.push(url);
      return { ok: true, json: async () => url.endsWith(':countTokens') ? { totalTokens: 12 } : valid };
    }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), context);
  await vm.runInContext(`(async () => {
    const client = createClient('test', [{ name: 'first' }, { name: 'chosen', inputTokenLimit: 1000 }], 'chosen');
    const count = await client.countTokens('transcript');
    if (count.tokens !== 12 || count.limit !== 850) throw new Error('Incorrect model limit');
    await client.generate('summarize', 'transcript');
  })()`, context);
  assert.equal(urls.length, 2);
  assert.ok(urls.every((url) => url.includes('/chosen:')));
  assert.throws(() => vm.runInContext("createClient('test', [{ name: 'first' }], 'missing')", context), /Selected model is unavailable/);
});

test('503 tries each model once and reports fallback progress', async () => {
  const progress = [], urls = [];
  const context = vm.createContext({
    YouTextSummary: api, YouTextModelFallback: require('../lib/model-fallback.js'), AbortController,
    setTimeout() { return 1; }, clearTimeout() {},
    browser: { runtime: { onMessage: { addListener() {} }, onConnect: { addListener() {} } } },
    fetch: async (url) => {
      urls.push(url);
      return url.includes('gemini-2.5-flash:')
        ? { ok: false, status: 503, json: async () => ({ error: { message: 'high demand' } }) }
        : { ok: true, json: async () => valid };
    }, progress
  });
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), context);
  await vm.runInContext(`createClient('test', ['gemini-2.5-flash', 'gemini-3.1-flash-lite'].map(name => ({ name, supportedGenerationMethods: ['generateContent', 'countTokens'] })), 'gemini-2.5-flash', true, text => progress.push(text)).generate('summarize', 'transcript')`, context);
  assert.equal(urls.length, 2);
  assert.equal(urls.filter(url => url.includes('gemini-2.5-flash:')).length, 1);
  assert.equal(urls.filter(url => url.includes('gemini-3.1-flash-lite:')).length, 1);
  assert.match(progress.at(-1), /another model/);
  assert.equal(context.YouTextModelFallback.candidates([{ name: 'gemini-2.5-flash', supportedGenerationMethods: ['generateContent', 'countTokens'] }]).length, 0);
});

test('automatic mode tries each unavailable model only once', async () => {
  const urls = [], progress = [];
  const context = vm.createContext({
    YouTextSummary: api, YouTextModelFallback: require('../lib/model-fallback.js'), AbortController,
    setTimeout, clearTimeout,
    browser: { runtime: { onMessage: { addListener() {} }, onConnect: { addListener() {} } } },
    fetch: async (url) => {
      urls.push(url);
      if (url.includes('gemini-3.7-flash:')) return { ok: false, status: 503, json: async () => ({ error: { message: 'high demand' } }) };
      return { ok: true, json: async () => valid };
    }, progress
  });
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), context);
  await vm.runInContext(`createClient('test', ['gemini-3.7-flash', 'gemini-2.5-flash-lite'].map(name => ({ name, supportedGenerationMethods: ['generateContent', 'countTokens'] })), '', false, text => progress.push(text)).generate('summarize', 'transcript')`, context);
  assert.equal(urls.filter(url => url.includes('gemini-3.7-flash:')).length, 1);
  assert.equal(urls.filter(url => url.includes('gemini-2.5-flash-lite:')).length, 1);
  assert.deepEqual(Array.from(progress), ['Trying another model…']);
});

test('deadline aborts a hanging request without retrying', async () => {
  let timer;
  const context = vm.createContext({
    YouTextSummary: api, YouTextModelFallback: { id: model => model }, AbortController,
    setTimeout(fn) { timer = fn; return 1; }, clearTimeout() {},
    browser: { runtime: { onMessage: { addListener() {} }, onConnect: { addListener() {} } } },
    fetch: (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
  });
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), context);
  const pending = vm.runInContext(`rawRequest('test', 'model', 'generateContent', {}, { deadline: Date.now() + 90000, onProgress() {} })`, context);
  timer();
  await assert.rejects(pending, /took too long/);
});

test('persistent generation port reports progress and returns the fallback result', async () => {
  let connectListener;
  const posted = [], messageListeners = [], disconnectListeners = [];
  const stored = { geminiApiKey: 'test' };
  let fetchCalls = 0;
  const port = {
    name: 'youtext:generation',
    onMessage: { addListener(fn) { messageListeners.push(fn); } },
    onDisconnect: { addListener(fn) { disconnectListeners.push(fn); } },
    postMessage(message) { posted.push(message); }
  };
  const context = vm.createContext({
    YouTextSummary: api, YouTextModelFallback: require('../lib/model-fallback.js'), AbortController,
    setTimeout(fn, delay) { if (delay < 5000) fn(); return 1; }, clearTimeout() {},
    browser: {
      storage: { local: { get: async () => stored, set: async values => Object.assign(stored, values) } },
      runtime: { onMessage: { addListener() {} }, onConnect: { addListener(fn) { connectListener = fn; } } }
    },
    fetch: async (url) => {
      fetchCalls++;
      if (url.includes('?pageSize=')) return { ok: true, json: async () => ({ models: ['gemini-3.8-flash', 'gemini-3.5-flash-lite'].map(name => ({ name, inputTokenLimit: 1000, supportedGenerationMethods: ['generateContent', 'countTokens'] })) }) };
      if (url.includes(':countTokens')) return { ok: true, json: async () => ({ totalTokens: 10 }) };
      if (url.includes('gemini-3.8-flash:')) return { ok: false, status: 503, json: async () => ({ error: { message: 'high demand' } }) };
      return { ok: true, json: async () => valid };
    }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), context);
  connectListener(port);
  const message = { type: 'youtext:summarize', videoId: 'video-1', paragraphs: ['transcript'], allowFallback: true };
  messageListeners[0](message);
  while (!posted.some(message => message.type === 'result')) await new Promise(setImmediate);
  assert.ok(posted.some(message => message.type === 'progress'));
  assert.deepEqual(posted.at(-1).result.bullets, ['a', 'b', 'c', 'd', 'e', 'f']);
  const callsAfterGeneration = fetchCalls;
  messageListeners[0](message);
  while (posted.filter(message => message.type === 'result').length < 2) await new Promise(setImmediate);
  assert.equal(fetchCalls, callsAfterGeneration);
  assert.equal(disconnectListeners.length, 2);
});

test('returns a cached summary without requiring transcript paragraphs', async () => {
  let messageListener;
  const result = { bullets: ['Cached summary.'] };
  const context = vm.createContext({
    YouTextSummary: api, YouTextModelFallback: {}, AbortController, setTimeout, clearTimeout,
    browser: {
      storage: { local: { get: async () => ({ youtextGeneratedContent: { 'v2:cached-video:youtext:summarize': { result } } }) } },
      runtime: { onMessage: { addListener(fn) { messageListener = fn; } }, onConnect: { addListener() {} } }
    }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../background.js'), 'utf8'), context);
  assert.deepEqual(await messageListener({ type: 'youtext:cached-summary', videoId: 'cached-video' }), result);
});
