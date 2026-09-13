const test = require('node:test');
const assert = require('node:assert/strict');
const { extractSegments, normalizeText, sentenceCase, titleSentenceCase, videoLinks } = require('../lib/transcript.js');

test('normalizes whitespace', () => assert.equal(normalizeText('  one\n  two\tthree  '), 'one two three'));
test('capitalizes the first letter of a transcript segment', () => {
  assert.equal(sentenceCase('  hello WORLD'), 'Hello WORLD');
  assert.equal(sentenceCase('“hello”'), '“Hello”');
});
test('standardizes video titles with only the first letter uppercase', () => {
  assert.equal(titleSentenceCase('  tÍTULO COM LETRAS MISTAS  '), 'Título com letras mistas');
  assert.equal(titleSentenceCase('“TÍTULO”'), '“Título”');
});

test('extracts unique titled video links', () => {
  const nodes = [
    { textContent: ' first video ', href: 'https://youtube.com/watch?v=1', getAttribute: () => '' },
    { textContent: 'first video', href: 'https://youtube.com/watch?v=1', getAttribute: () => '' },
    { textContent: 'second video', href: 'https://youtube.com/watch?v=2', getAttribute: () => '' }
  ];
  assert.deepEqual(videoLinks({ querySelectorAll: () => nodes }, 'a'), [{ title: 'first video', href: 'https://youtube.com/watch?v=1' }, { title: 'second video', href: 'https://youtube.com/watch?v=2' }]);
});

test('extracts segment text without timestamps', () => {
  const segments = [
    { querySelector: () => ({ textContent: '0:04 First sentence' }), textContent: '' },
    { querySelector: () => ({ textContent: '1:02:03 Second sentence' }), textContent: '' }
  ];
  assert.deepEqual(extractSegments(segments), ['First sentence', 'Second sentence']);
});

test('uses segment content when the text child is unavailable', () => {
  assert.deepEqual(extractSegments([{ querySelector: () => null, textContent: '  A fallback segment  ' }]), ['A fallback segment']);
});

test('drops empty segments', () => {
  const segments = [{ querySelector: () => ({ textContent: '  ' }), textContent: '' }, { querySelector: () => ({ textContent: 'Useful text' }), textContent: '' }];
  assert.deepEqual(extractSegments(segments), ['Useful text']);
});
