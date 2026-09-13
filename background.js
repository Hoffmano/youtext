const api = globalThis.YouTextSummary;
const fallback = globalThis.YouTextModelFallback;
const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';
const SUMMARY_INSTRUCTION = 'Summarize the transcript in English as a JSON array of strings only. Choose the number of bullets needed; there is no fixed limit. Include only essential, relevant conclusions. Keep every bullet objective, concise, and self-contained. Preserve important facts, decisions, numbers, and disagreements. Do not add an introduction, repetition, filler, or a generic closing conclusion. If useful reader actions follow from the subject, list them as the final actionable bullets; otherwise omit actions.';
const ARTICLE_INSTRUCTION = 'Write a coherent article in English, slightly more detailed than a short summary: about 400–600 words, or less if the source is short. Translate the source content into natural English when needed. Explain the main ideas, reasoning, examples and conclusions actually present in the source. Do not invent facts or add outside information. Return exactly six prose paragraphs as a JSON array of strings only, without Markdown or bullet points.';
const PARTIAL_INSTRUCTION = 'Extract only the essential conclusions and important facts from this transcript section as concise English bullets. Choose the number of bullets needed; there is no fixed limit. Direct wording only. Return a JSON array of strings only.';
const MODEL_CACHE_KEY = 'youtextPreferredModel';
const MODEL_CACHE_TTL = 24 * 60 * 60 * 1000;
const GENERATION_CACHE_KEY = 'youtextGeneratedContent';
const GENERATION_CACHE_LIMIT = 100;

function errorMessage(response, payload) {
  const message = payload && payload.error && payload.error.message;
  if ([400, 401, 403].includes(response.status)) return 'Gemini API key is invalid or unavailable.';
  if (response.status === 503) return 'The model is temporarily busy. Try again or allow another model.';
  if (response.status === 429) return 'Gemini quota reached. Try again later or check AI Studio.';
  return message || 'Gemini could not generate the summary.';
}

async function rawRequest(key, model, action, payload, recovery) {
  const remaining = recovery.deadline - Date.now();
  if (remaining <= 0) throw new Error('The service took too long. Try again shortly.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remaining);
  try {
  const response = await fetch(`${API_ROOT}/${fallback.id(model)}:${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(payload), signal: controller.signal });
  const body = await response.json().catch(() => null);
  if (response.ok) return body;
  const error = new Error(errorMessage(response, body)); error.status = response.status; error.payload = body; throw error;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The service took too long. Try again shortly.');
    throw error;
  } finally { clearTimeout(timer); }
}

async function availableModels(key) {
  const response = await fetch(`${API_ROOT}?pageSize=1000`, { headers: { 'x-goog-api-key': key } });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(response, body));
  const candidates = fallback.candidates(body && body.models || [], Infinity);
  if (!candidates.length) throw new Error('No compatible Gemini models are available for this API key.');
  return candidates;
}

function contents(text) { return [{ role: 'user', parts: [{ text }] }]; }
function safeLimit(model) { return Math.floor(Number(model.inputTokenLimit || api.INPUT_TOKEN_LIMIT) * 0.85); }

function createClient(key, models, selectedModel = '', allowFallback = false, onProgress = () => {}, onModelSuccess = async () => {}) {
  const recovery = { deadline: Date.now() + 90000 };
  const selected = selectedModel && models.find((model) => fallback.id(model) === selectedModel);
  if (selectedModel && !selected) throw new Error('Selected model is unavailable. Choose another model in YouText settings.');
  const execute = (operation) => selected && !allowFallback ? operation(selected) : fallback.withFallback(models, operation, Date.now, { preferred: selectedModel, onProgress });
  const call = (action, payload) => execute(async (model) => ({ model, body: await rawRequest(key, model, action, payload, recovery) }));
  return {
    async countTokens(text) {
      const result = await execute(async (model) => ({ model, body: await rawRequest(key, model, 'countTokens', { contents: contents(text) }, recovery) }));
      return { tokens: Number(result.body.totalTokens || 0), limit: safeLimit(result.model) };
    },
    async generate(instruction, text, expectedItems = null) {
      const generated = await call('generateContent', {
          systemInstruction: { parts: [{ text: instruction }] }, contents: contents(text),
          generationConfig: { temperature: 0.2, maxOutputTokens: 8192, responseMimeType: 'application/json',
            responseSchema: { type: 'ARRAY', items: { type: 'STRING' }, minItems: expectedItems || 1, ...(expectedItems ? { maxItems: expectedItems } : {}) } }
      });
      const response = generated.body;
      const candidate = response?.candidates?.[0];
      if (candidate?.finishReason && !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason)) {
        throw new Error('Gemini could not complete the summary. Try again.');
      }
      if (candidate?.finishReason === 'MAX_TOKENS') throw new Error('The summary exceeded Gemini’s output limit. Try again.');
      const generatedText = (candidate?.content?.parts || []).filter((part) => !part.thought && typeof part.text === 'string').map((part) => part.text).join('');
      const bullets = api.parseBullets(generatedText, expectedItems);
      await onModelSuccess(fallback.id(generated.model));
      return bullets;
    }
  };
}

function cachedModel(cache, models, now = Date.now()) {
  if (!cache?.id || !Number.isFinite(cache.savedAt) || now - cache.savedAt >= MODEL_CACHE_TTL) return '';
  return models.some((model) => fallback.id(model) === cache.id) ? cache.id : '';
}

function generationCacheId(message) {
  if (!message?.videoId || !['youtext:article', 'youtext:summarize'].includes(message.type)) return '';
  return `v2:${message.videoId}:${message.type}`;
}

async function cachedGeneration(message) {
  const id = generationCacheId(message);
  if (!id) return null;
  const stored = await browser.storage.local.get(GENERATION_CACHE_KEY);
  return stored[GENERATION_CACHE_KEY]?.[id]?.result || null;
}

async function saveGeneration(message, result) {
  const id = generationCacheId(message);
  if (!id || typeof browser.storage.local.set !== 'function') return;
  const stored = await browser.storage.local.get(GENERATION_CACHE_KEY);
  const cache = stored[GENERATION_CACHE_KEY] || {};
  cache[id] = { result, savedAt: Date.now() };
  const entries = Object.entries(cache).sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, GENERATION_CACHE_LIMIT);
  await browser.storage.local.set({ [GENERATION_CACHE_KEY]: Object.fromEntries(entries) });
}

async function summarizeChunk(client, chunk) {
  const count = await client.countTokens(chunk);
  if (count.tokens <= count.limit) return client.generate(PARTIAL_INSTRUCTION, chunk);
  const chunks = api.chunkParagraphs(chunk.split('\n'), Math.max(1000, Math.floor(chunk.length / 2)));
  if (chunks.length < 2) throw new Error('Transcript section is too large to summarize.');
  const bullets = [];
  for (const item of chunks) bullets.push(...await summarizeChunk(client, item));
  return bullets;
}

async function consolidate(client, text, instruction = SUMMARY_INSTRUCTION, expectedItems = null) {
  const count = await client.countTokens(text);
  if (count.tokens <= count.limit) return client.generate(instruction, text, expectedItems);
  const partials = [];
  for (const chunk of api.chunkParagraphs(text.split('\n'), 400000)) partials.push(...await summarizeChunk(client, chunk));
  return consolidate(client, partials.map((bullet) => `- ${bullet}`).join('\n'), instruction, expectedItems);
}

async function summarizeTranscript(paragraphs, selectedModel = '', article = false, allowFallback = false, onProgress = () => {}) {
  const settings = await browser.storage.local.get(['geminiApiKey', MODEL_CACHE_KEY]);
  const { geminiApiKey } = settings;
  if (!geminiApiKey) throw new Error('Add your Gemini API key in YouText settings first.');
  const transcript = paragraphs.map((value) => String(value || '').trim()).filter(Boolean).join('\n');
  if (!transcript) throw new Error('The transcript is empty.');
  const models = await availableModels(geminiApiKey);
  const cache = settings[MODEL_CACHE_KEY];
  const automaticModel = selectedModel || cachedModel(cache, models);
  const cycleStartedAt = automaticModel && !selectedModel ? cache.savedAt : Date.now();
  if (!selectedModel && cache?.id && !automaticModel) await browser.storage.local.remove?.(MODEL_CACHE_KEY);
  const remember = selectedModel ? async () => {} : async (id) => browser.storage.local.set?.({ [MODEL_CACHE_KEY]: { id, savedAt: cycleStartedAt } });
  const client = createClient(geminiApiKey, models, automaticModel, allowFallback, onProgress, remember);
  const count = await client.countTokens(transcript);
  let source = transcript;
  if (count.tokens > count.limit) {
    const partials = [];
    for (const chunk of api.chunkParagraphs(paragraphs, 400000)) partials.push(...await summarizeChunk(client, chunk));
    source = partials.map((bullet) => `- ${bullet}`).join('\n');
  }
  const result = await consolidate(client, source, article ? ARTICLE_INSTRUCTION : SUMMARY_INSTRUCTION, article ? 6 : null);
  return article ? { paragraphs: result } : { bullets: result };
}

browser.runtime.onConnect.addListener((port) => {
  if (port.name !== 'youtext:generation') return;
  port.onMessage.addListener(async (message) => {
    if (!['youtext:article', 'youtext:summarize'].includes(message?.type)) return;
    let connected = true;
    port.onDisconnect.addListener(() => { connected = false; });
    const post = (payload) => { if (connected) try { port.postMessage(payload); } catch { connected = false; } };
    try {
      const cached = await cachedGeneration(message);
      if (cached) { post({ type: 'result', result: cached }); return; }
      const result = await summarizeTranscript(message.paragraphs, message.model, message.type === 'youtext:article', message.allowFallback, (text) => post({ type: 'progress', text }));
      await saveGeneration(message, result);
      post({ type: 'result', result });
    } catch (error) {
      post({ type: 'error', message: error?.message || 'Could not generate content.' });
    }
  });
});

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === 'youtext:cached-summary') {
    return cachedGeneration({ type: 'youtext:summarize', videoId: message.videoId });
  }
  if (message?.type === 'youtext:models') {
    return browser.storage.local.get('geminiApiKey').then(({ geminiApiKey }) => {
      if (!geminiApiKey) throw new Error('Add your Gemini API key in YouText settings first.');
      return availableModels(geminiApiKey);
    }).then((models) => models.map((model) => ({ id: fallback.id(model), name: model.displayName || fallback.id(model) })));
  }
});
