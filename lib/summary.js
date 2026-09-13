(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.YouTextSummary = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  const MODEL = 'gemini-3.1-flash-lite';
  const INPUT_TOKEN_LIMIT = 1048576;
  const SAFE_INPUT_TOKENS = 900000;

  function estimateTokens(text) { return Math.ceil((text || '').length / 4); }

  function chunkParagraphs(paragraphs, maxCharacters) {
    const chunks = [];
    let current = [];
    let size = 0;
    for (const paragraph of paragraphs) {
      const text = (paragraph || '').trim();
      if (!text) continue;
      if (current.length && size + text.length + 1 > maxCharacters) {
        chunks.push(current.join('\n'));
        current = []; size = 0;
      }
      if (text.length > maxCharacters) {
        if (current.length) { chunks.push(current.join('\n')); current = []; size = 0; }
        for (let start = 0; start < text.length; start += maxCharacters) chunks.push(text.slice(start, start + maxCharacters));
      } else {
        current.push(text); size += text.length + 1;
      }
    }
    if (current.length) chunks.push(current.join('\n'));
    return chunks;
  }

  function parseBullets(value, expected = null) {
    const source = typeof value === 'string' ? value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '') : value;
    const start = typeof source === 'string' ? source.indexOf('[') : -1;
    const end = typeof source === 'string' ? source.lastIndexOf(']') : -1;
    let items;
    try {
      items = Array.isArray(source) ? source : JSON.parse(start >= 0 && end >= start ? source.slice(start, end + 1) : source);
    } catch {
      throw new Error('Gemini returned an incomplete or invalid summary. Try again.');
    }
    if (!Array.isArray(items)) throw new Error('Gemini returned an invalid summary.');
    const bullets = items.map((item) => typeof item === 'string' ? item.replace(/\s+/g, ' ').trim() : '').filter(Boolean);
    if (!bullets.length) throw new Error('Gemini returned an empty summary.');
    if (expected && bullets.length !== expected) throw new Error(`Gemini must return exactly ${expected} items.`);
    return bullets;
  }

  function contextRemaining(inputTokens) { return Math.max(0, INPUT_TOKEN_LIMIT - Number(inputTokens || 0)); }

  return { MODEL, INPUT_TOKEN_LIMIT, SAFE_INPUT_TOKENS, chunkParagraphs, contextRemaining, estimateTokens, parseBullets };
});
