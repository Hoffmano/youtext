const test = require('node:test');
const assert = require('node:assert/strict');
const { candidates, withFallback } = require('../lib/model-fallback.js');

const methods = ['generateContent', 'countTokens'];
const models = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash', 'gemma-4-31b'].map((name) => ({ name: `models/${name}`, supportedGenerationMethods: methods }));

test('orders supported models by quality preference', () => {
  assert.deepEqual(candidates(models).map((model) => model.name), ['models/gemini-3.8-flash', 'models/gemini-2.5-flash', 'models/gemini-3.1-flash-lite', 'models/gemma-4-31b']);
});

test('moves to the next model after a 429', async () => {
  const attempted = [];
  const result = await withFallback(models, async (model) => {
    attempted.push(model.name);
    if (attempted.length === 1) { const error = new Error('quota'); error.status = 429; error.payload = {}; throw error; }
    return model.name;
  });
  assert.equal(result, 'models/gemini-2.5-flash');
  assert.deepEqual(attempted, ['models/gemini-3.8-flash', 'models/gemini-2.5-flash']);
});

test('moves to the next model after NS_BINDING_ABORTED', async () => {
  const attempted = [];
  const expected = candidates(models).slice(0, 2).map((model) => model.name);
  const result = await withFallback(models, async (model) => {
    attempted.push(model.name);
    if (attempted.length === 1) throw new TypeError('NetworkError: NS_BINDING_ABORTED');
    return model.name;
  });
  assert.equal(result, expected[1]);
  assert.deepEqual(attempted, expected);
});

test('does not hide non-quota failures', async () => {
  await assert.rejects(withFallback(models, async () => { const error = new Error('invalid key'); error.status = 401; throw error; }), /invalid key/);
});
