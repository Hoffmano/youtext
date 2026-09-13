(function (root) {
  let busy = false;
  const text = (node) => (node.textContent || node.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
  function find(root, selector, pattern) {
    return [...root.querySelectorAll(selector)].find((node) => !node.closest('[hidden], [aria-hidden="true"]') && pattern.test(text(node)));
  }
  async function wait(find, stage) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const value = find();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Pending step: ${stage}. YouTube did not show the expected control.`);
  }
  async function watched(document, href) {
    if (busy) throw new Error('Wait for the previous action to finish.');
    busy = true;
    let removed = false;
    try {
      const id = new URL(href, 'https://www.youtube.com').searchParams.get('v');
      const card = [...document.querySelectorAll('a[href]')].map((link) => {
        let url;
        try { url = new URL(link.getAttribute('href'), 'https://www.youtube.com'); } catch { return null; }
        return url.pathname === '/watch' && url.searchParams.get('v') === id
          ? link.closest('ytd-rich-item-renderer, ytd-compact-video-renderer, yt-lockup-view-model, ytd-video-renderer') : null;
      }).find(Boolean);
      const menu = card?.querySelector('ytd-menu-renderer button, button[aria-haspopup="true"], button[aria-label*="ction"], button[aria-label*="ções"]');
      if (!menu) throw new Error('This video menu is unavailable. Use the action on the YouTube home page.');
      const controls = 'button, [role="button"], a, yt-button-renderer, yt-button-view-model';
      const whyPattern = /^(diga o motivo|diga por qu[eê]|conte o motivo|informar o motivo|tell us why)[.!?]?$/i;
      const previousWhy = new Set([...document.querySelectorAll(controls)].filter((node) => whyPattern.test(text(node)) && !node.closest('[hidden], [aria-hidden="true"]')));
      menu.click();
      const item = await wait(() => find(document, 'ytd-menu-service-item-renderer, [role="menuitem"]', /^(não tenho interesse|not interested)$/i), 'open “Not interested”');
      item.click(); removed = true;
      const why = await wait(() => {
        const local = card.isConnected && find(card, controls, whyPattern);
        if (local) return local;
        // YouTube can replace the card with a dismissal renderer or show a toast.
        // Only consider controls newly shown by this action, not older dismissals.
        const candidates = [...document.querySelectorAll(controls)].filter((node) => !previousWhy.has(node) && !node.closest('[hidden], [aria-hidden="true"]') && whyPattern.test(text(node)));
        const leaves = candidates.filter((node) => !candidates.some((other) => other !== node && node.contains(other)));
        return leaves.length === 1 ? leaves[0] : null;
      }, 'find “Tell us why” after removing the video');
      (why.querySelector('button, [role="button"]') || why).click();
      const checkboxSelector = 'tp-yt-paper-checkbox, [role="checkbox"], label';
      const watchedPattern = /já assisti|already watched/i;
      const dialog = await wait(() => [...document.querySelectorAll('tp-yt-paper-dialog, [role="dialog"], ytd-feedback-dialog-renderer')].find((node) => !node.closest('[hidden], [aria-hidden="true"]') && find(node, checkboxSelector, watchedPattern)), 'open the “Already watched” dialog');
      const checkbox = find(dialog, checkboxSelector, watchedPattern);
      if (checkbox.getAttribute('aria-checked') !== 'true' && !checkbox.hasAttribute('checked') && !checkbox.querySelector('input:checked')) checkbox.click();
      const submit = await wait(() => {
        const button = find(dialog, 'button, [role="button"]', /^(enviar|submit)$/i);
        return button && !button.disabled && button.getAttribute('aria-disabled') !== 'true' ? button : null;
      }, 'find the “Submit” button');
      submit.click();
      await wait(() => !dialog.isConnected || dialog.closest('[hidden], [aria-hidden="true"]') || dialog.style.display === 'none', 'wait for the dialog to close after submitting');
    } catch (error) {
      if (removed) throw new Error(`“Not interested” was selected, but “Already watched” could not be confirmed. ${error.message}`);
      throw error;
    } finally { busy = false; }
  }
  async function watchLater(document, href, remove = false) {
    if (busy) throw new Error('Wait for the previous action to finish.');
    busy = true;
    try {
      const id = new URL(href, 'https://www.youtube.com').searchParams.get('v');
      const card = [...document.querySelectorAll('a[href]')].map((link) => {
        let url; try { url = new URL(link.getAttribute('href'), 'https://www.youtube.com'); } catch { return null; }
        return url.pathname === '/watch' && url.searchParams.get('v') === id ? link.closest('ytd-rich-item-renderer, ytd-compact-video-renderer, yt-lockup-view-model, ytd-video-renderer, ytd-playlist-video-renderer') : null;
      }).find(Boolean);
      const menu = card?.querySelector('ytd-menu-renderer button, button[aria-haspopup="true"], button[aria-label*="ction"], button[aria-label*="ções"]');
      if (!menu) throw new Error('This video menu is unavailable. Open the native YouTube list to finish.');
      menu.click();
      const pattern = remove ? /remover de assistir mais tarde|remove from watch later/i : /salvar em assistir mais tarde|save to watch later|save to watch later playlist|salvar na playlist|save to playlist/i;
      const item = await wait(() => find(document, 'ytd-menu-service-item-renderer, [role="menuitem"]', pattern), remove ? 'remove from Read later' : 'save to Read later');
      item.click();
      if (!remove && /salvar na playlist|save to playlist/i.test(text(item))) {
        const later = await wait(() => find(document, 'ytd-menu-service-item-renderer, [role="menuitem"]', /assistir mais tarde|watch later/i), 'select Read later');
        later.click();
      }
    } finally { busy = false; }
  }
  function clickControl(document, patterns, label) {
    const controls = [...document.querySelectorAll('button, [role="button"]')];
    const control = controls.find((node) => {
      const value = text(node).toLowerCase();
      return patterns.some((pattern) => pattern.test(value)) && !node.disabled && node.getAttribute('aria-disabled') !== 'true';
    });
    if (!control) throw new Error(`“${label}” is unavailable on YouTube.`);
    control.click();
  }
  function reactionState(document) {
    const controls = [...document.querySelectorAll('button[aria-pressed], [role="button"][aria-pressed]')];
    const active = (patterns) => controls.some((node) => patterns.some((pattern) => pattern.test(text(node))) && node.getAttribute('aria-pressed') === 'true');
    return {
      like: active([/^gostei/i, /^like this video/i, /^like$/i]),
      dislike: active([/^não gostei/i, /^dislike this video/i, /^dislike$/i])
    };
  }
  function like(document, positive) {
    clickControl(document, positive ? [/^gostei/i, /^like this video/i, /^like$/i] : [/^não gostei/i, /^dislike this video/i, /^dislike$/i], positive ? 'Like' : 'Dislike');
  }
  function currentWatchLater(document, remove = false) {
    clickControl(document, remove ? [/remover de assistir mais tarde/i, /remove from watch later/i] : [/salvar em assistir mais tarde/i, /save to watch later/i, /save to playlist/i], remove ? 'Remove from Read later' : 'Add to Read later');
  }
  async function markRead(id) {
    const key = `youtextRead:${id}`;
    const result = await browser.storage.local.get('youtextReadVideos');
    const ids = new Set(result.youtextReadVideos || []); ids.add(id);
    await browser.storage.local.set({ youtextReadVideos: [...ids] });
  }
  async function isRead(id) {
    const result = await browser.storage.local.get('youtextReadVideos');
    return (result.youtextReadVideos || []).includes(id);
  }
  root.YouTextFeedback = { watched, watchLater, like, currentWatchLater, reactionState, markRead, isRead };
  if (typeof module === 'object' && module.exports) module.exports = root.YouTextFeedback;
})(globalThis);
