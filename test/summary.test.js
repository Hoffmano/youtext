const test = require('node:test');
const assert = require('node:assert/strict');
const { INPUT_TOKEN_LIMIT, chunkParagraphs, contextRemaining, estimateTokens, parseBullets } = require('../lib/summary.js');

test('estimates tokens and reports remaining model context', () => {
  assert.equal(estimateTokens('12345678'), 2);
  assert.equal(contextRemaining(42), INPUT_TOKEN_LIMIT - 42);
  assert.equal(contextRemaining(INPUT_TOKEN_LIMIT + 1), 0);
});

test('chunks paragraphs without dropping or reordering text', () => {
  assert.deepEqual(chunkParagraphs(['one', 'two', 'three'], 8), ['one\ntwo', 'three']);
});

test('splits a paragraph larger than the configured chunk', () => {
  assert.deepEqual(chunkParagraphs(['abcdefgh'], 3), ['abc', 'def', 'gh']);
});

test('accepts any positive number of normalized bullets', () => {
  assert.deepEqual(parseBullets('[" a ", "b"]'), ['a', 'b']);
  assert.deepEqual(parseBullets('[" a ", "b", "c", "d", "e", "f"]'), ['a', 'b', 'c', 'd', 'e', 'f']);
});

test('accepts a JSON array wrapped in a markdown fence', () => {
  assert.deepEqual(parseBullets('```json\n["a", "b", "c", "d", "e", "f"]\n```'), ['a', 'b', 'c', 'd', 'e', 'f']);
});

test('rejects malformed, empty, or explicitly incomplete Gemini output', () => {
  assert.throws(() => parseBullets('not json'));
  assert.throws(() => parseBullets('[]'), /empty summary/);
  assert.throws(() => parseBullets('["a"]', 6), /exactly 6 items/);
});
