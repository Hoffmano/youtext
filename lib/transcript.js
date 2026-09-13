(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.YouTextTranscript = api;
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  function normalizeText(text) { return (text || '').replace(/\s+/g, ' ').trim(); }
  function sentenceCase(text) {
    const normalized = normalizeText(text);
    return normalized.replace(/^(\P{L}*)(\p{Ll})/u, (_, prefix, first) => prefix + first.toLocaleUpperCase());
  }
  function titleSentenceCase(text) {
    return sentenceCase(normalizeText(text).toLocaleLowerCase());
  }

  function transcriptButton(root) {
    const scoped = root.querySelector('ytd-video-description-transcript-section-renderer button, ytd-video-description-transcript-section-renderer [role="button"]');
    if (scoped) return scoped;
    return [...root.querySelectorAll('button, [role="button"]')].find((button) =>
      /transcri|transcript/i.test(`${button.getAttribute('aria-label') || ''} ${button.textContent || ''}`)
    ) || null;
  }

  function segmentText(segment) {
    const textNode = segment.querySelector('.segment-text, yt-formatted-string');
    return normalizeText(textNode ? textNode.textContent : segment.textContent).replace(/^\d{1,2}:\d{2}(?::\d{2})?\s+/, '');
  }

  function extractSegments(segments) { return [...segments].map(segmentText).filter(Boolean); }

  function transcriptSegments(root) {
    return root.querySelectorAll('ytd-transcript-segment-renderer, ytd-transcript-segment-list-renderer [data-start-ms]');
  }
  function videoLinks(root, selector) {
    const seen = new Set();
    return [...root.querySelectorAll(selector)].map((node) => ({ title: normalizeText(node.textContent || node.getAttribute('title')), href: node.href || node.getAttribute('href') || '' }))
      .filter((video) => video.title && video.href && !seen.has(video.href) && seen.add(video.href));
  }

  function listingVideos(root) {
    const videos = new Map();
    for (const link of root.querySelectorAll('a[href]')) {
      let url;
      try { url = new URL(link.getAttribute('href'), 'https://www.youtube.com'); } catch { continue; }
      if (!['www.youtube.com', 'youtube.com'].includes(url.hostname) || url.pathname !== '/watch' || !url.searchParams.get('v')) continue;
      // Accessibility labels often include channel, age and views. Only read title elements.
      const titleNode = link.querySelector('#video-title, .yt-core-attributed-string, h3') ||
        (link.matches('#video-title, #video-title-link') || link.closest('h3') ? link : null);
      const title = normalizeText(link.getAttribute('title') || (titleNode && titleNode.textContent));
      if (!title) continue;
      const href = '/watch?v=' + encodeURIComponent(url.searchParams.get('v'));
      const card = link.closest('ytd-rich-grid-media, yt-lockup-view-model, ytd-video-renderer, ytd-compact-video-renderer') || link.parentElement;
      const channelNode = card?.querySelector('ytd-channel-name #text, #channel-name #text, a[href^="/@"], a[href^="/channel/"]');
      const channel = normalizeText(channelNode?.getAttribute('title') || channelNode?.textContent);
      if (!videos.has(href)) videos.set(href, { href, title, ...(channel && { channel }) });
    }
    return [...videos.values()];
  }

  return { extractSegments, normalizeText, sentenceCase, titleSentenceCase, transcriptButton, transcriptSegments, videoLinks, listingVideos };
});
