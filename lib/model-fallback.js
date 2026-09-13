(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.YouTextModelFallback = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  const PRIORITY = [
    /^gemini-3\.8-flash(?:$|-)(?!lite)/, /^gemini-3\.7-flash(?:$|-)(?!lite)/,
    /^gemini-3\.6-flash(?:$|-)(?!lite)/, /^gemini-3\.5-flash(?:$|-)(?!lite)/,
    /^gemini-3-flash(?:$|-)(?!lite)/, /^gemini-2\.5-flash(?:$|-)(?!lite)/,
    /^gemini-3\.5-flash-lite/, /^gemini-3\.1-flash-lite/, /^gemini-2\.5-flash-lite/,
    /^gemma-4-31b/, /^gemma-4-26b/
  ];
  const unavailableUntil = new Map();

  function id(model) { return String(model.name || model).replace(/^models\//, ''); }
  function supports(model) {
    const methods = model.supportedGenerationMethods || [];
    return methods.includes('generateContent') && methods.includes('countTokens');
  }
  function rank(model) {
    const value = id(model);
    const index = PRIORITY.findIndex((pattern) => pattern.test(value));
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  }
  function candidates(models, now = Date.now()) {
    return models.filter(supports).filter((model) => rank(model) < Number.MAX_SAFE_INTEGER)
      .filter((model) => (unavailableUntil.get(id(model)) || 0) <= now)
      .sort((a, b) => rank(a) - rank(b));
  }
  function retryDelay(payload) {
    const details = payload && payload.error && payload.error.details;
    const retry = Array.isArray(details) && details.find((detail) => /RetryInfo$/.test(detail['@type'] || ''));
    const value = retry && retry.retryDelay;
    const seconds = typeof value === 'string' && /^\d+(?:\.\d+)?s$/.test(value) ? Number.parseFloat(value) : 60;
    return Math.max(1, seconds) * 1000;
  }
  function isTemporary(error) {
    if ([429, 503].includes(error?.status)) return true;
    for (let current = error; current; current = current.cause) {
      if ([current.name, current.code, current.message].some((value) => String(value || '').includes('NS_BINDING_ABORTED'))) return true;
    }
    return false;
  }
  async function withFallback(models, execute, now = Date.now, options = {}) {
    const tried = [];
    const ordered = candidates(models, now());
    if (options.preferred) ordered.sort((a, b) => Number(id(b) === options.preferred) - Number(id(a) === options.preferred));
    for (const model of ordered) {
      tried.push(id(model));
      if (tried.length > 1) options.onProgress?.('Trying another model…');
      try { return await execute(model); }
      catch (error) {
        if (!isTemporary(error)) throw error;
        unavailableUntil.set(id(model), now() + retryDelay(error.payload));
      }
    }
    const error = new Error('All models are temporarily busy or out of quota. Try again shortly.');
    error.temporarilyUnavailable = true; error.triedModels = tried;
    throw error;
  }
  return { candidates, id, isTemporary, rank, retryDelay, withFallback };
});
