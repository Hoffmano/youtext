(function (root) {
  let clientConfig = {};
  function config(html) {
    const value = (name) => new RegExp(`"${name}"\\s*:\\s*"([^"]+)"`).exec(html)?.[1];
    return { apiKey: value('INNERTUBE_API_KEY'), clientVersion: value('INNERTUBE_CLIENT_VERSION') };
  }
  function initialData(html) {
    const match = /(?:var\s+ytInitialData|window\s*\[\s*["']ytInitialData["']\s*\]|\bytInitialData)\s*=\s*/.exec(html);
    if (!match) throw new Error('Could not read the Read later list. Check your YouTube session.');
    const start = match.index + match[0].length;
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < html.length; i++) {
      const char = html[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '{') depth++;
      else if (char === '}' && --depth === 0) return JSON.parse(html.slice(start, i + 1));
    }
    throw new Error('The YouTube response is incomplete. Try refreshing the list.');
  }
  function playlist(data) {
    const videos = new Map();
    let found = false, partial = false;
    function visit(node, inPlaylist = false) {
      if (!node || typeof node !== 'object') return;
      if (node.playlistVideoListRenderer) { found = true; visit(node.playlistVideoListRenderer, true); return; }
      if (inPlaylist && node.continuationItemRenderer) partial = true;
      if (inPlaylist && node.playlistVideoRenderer) {
        const video = node.playlistVideoRenderer;
        const title = video.title?.simpleText || video.title?.runs?.map((run) => run.text).join('');
        const removeAction = video.menu?.menuRenderer?.items?.map((item) => item.menuServiceItemRenderer)
          .find((item) => item?.serviceEndpoint?.playlistEditEndpoint?.actions?.some((action) => action.action === 'ACTION_REMOVE_VIDEO'))?.serviceEndpoint;
        if (video.videoId && title && video.isPlayable !== false) {
          const item = { href: '/watch?v=' + encodeURIComponent(video.videoId), title };
          if (removeAction) item.removeAction = removeAction;
          videos.set(video.videoId, item);
        }
        return;
      }
      for (const value of Object.values(node)) visit(value, inPlaylist);
    }
    visit(data);
    if (!found) throw new Error('Read later is unavailable. Confirm that you are signed in to YouTube.');
    return { videos: [...videos.values()], partial };
  }
  async function load() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/playlist?list=WL', { credentials: 'include', cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Could not load Read later. Try again.');
      const html = await response.text();
      clientConfig = config(html);
      return playlist(initialData(html));
    } finally { clearTimeout(timer); }
  }
  async function remove(video) {
    const command = video.removeAction;
    const edit = command?.playlistEditEndpoint;
    if (!edit) throw new Error('YouTube did not provide a removal action. Refresh Read later and try again.');
    const apiUrl = command.commandMetadata?.webCommandMetadata?.apiUrl || '/youtubei/v1/browse/edit_playlist';
    const url = new URL(apiUrl, location.origin);
    if (clientConfig.apiKey) url.searchParams.set('key', clientConfig.apiKey);
    const headers = { 'Content-Type': 'application/json', 'X-Origin': location.origin, 'X-Youtube-Bootstrap-Logged-In': 'true' };
    const cookies = Object.fromEntries(document.cookie.split(';').map((part) => part.trim().split(/=(.*)/s).slice(0, 2)));
    const secret = cookies.SAPISID || cookies.__Secure_3PAPISID || cookies['__Secure-3PAPISID'];
    if (secret && crypto?.subtle) {
      const timestamp = Math.floor(Date.now() / 1000);
      const input = `${timestamp} ${secret} ${location.origin}`;
      const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
      const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      headers.Authorization = `SAPISIDHASH ${timestamp}_${hash}`;
    }
    const response = await fetch(url.href, {
      method: 'POST', credentials: 'include',
      headers,
      body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: clientConfig.clientVersion || '2.20260901.00.00' } }, ...edit })
    });
    if (!response.ok) throw new Error('Could not remove the video from Read later. Try again.');
  }
  root.YouTextWatchLater = { load, remove, initialData, playlist, config };
  if (typeof module === 'object' && module.exports) module.exports = root.YouTextWatchLater;
})(globalThis);
