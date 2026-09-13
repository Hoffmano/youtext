const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHTML } = require('linkedom');
const { extractSegments, normalizeText, sentenceCase, titleSentenceCase, transcriptButton, transcriptSegments, videoLinks } = require('../lib/transcript.js');

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

test('extracts modern YouTube transcript view-model segments', () => {
  const { document } = parseHTML('<transcript-segment-view-model><div class="ytwTranscriptSegmentViewModelTimestamp">0:04</div><div class="ytwTranscriptSegmentViewModelTimestampA11yLabel">4 seconds</div><span class="ytAttributedStringHost" role="text">Modern transcript text</span></transcript-segment-view-model>');
  assert.deepEqual(extractSegments(transcriptSegments(document)), ['Modern transcript text']);
});

test('does not mistake the transcript close action for the open action', () => {
  const { document } = parseHTML('<ytd-engagement-panel-section-list-renderer><button aria-label="Close transcript"></button></ytd-engagement-panel-section-list-renderer><button aria-label="Show transcript"></button>');
  assert.equal(transcriptButton(document).getAttribute('aria-label'), 'Show transcript');
});
