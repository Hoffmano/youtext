(() => {
  const api = globalThis.YouTextTranscript;
  const ui = globalThis.YouTextUI;
  let renderedVideoId = null;
  let pendingVideoId = null;
  let listing = null;
  let routeVersion = 0;

  function videoId() { return location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null; }
  function playSilently() {
    if (!videoId()) return;
    document.querySelectorAll('video').forEach((video) => {
      video.muted = true;
      video.defaultMuted = true;
      video.volume = 0;
      if (video.paused) video.play().catch(() => {});
    });
  }

  function appendStyle() {
    if (document.getElementById('youtext-preload')) return;
    const style = document.createElement('style');
    style.id = 'youtext-preload';
    style.textContent = 'html[data-youtext-loading="true"] body{visibility:hidden!important}html[data-youtext-loading="true"]::before{content:attr(data-youtext-status);position:fixed;z-index:2147483647;inset:calc(50vh + 28px) 0 auto;text-align:center;color:#b8beb5;font:18px/1.5 "Atkinson Hyperlegible",Verdana,Arial,sans-serif}html[data-youtext-loading="true"]::after{content:"";position:fixed;z-index:2147483647;top:calc(50vh - 18px);left:calc(50vw - 18px);width:32px;height:32px;border:3px solid #46534a;border-top-color:#a8c8ae;border-radius:50%;animation:youtext-spin .8s linear infinite}@keyframes youtext-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){html[data-youtext-loading="true"]::after{animation-duration:1.8s}}';
    document.documentElement.append(style);
  }

  function waitFor(find, { timeout = 30000, current = () => true } = {}) {
    return new Promise((resolve, reject) => {
      let observer;
      let timer;
      let poller;
      const finish = (callback, value) => {
        clearTimeout(timer); clearInterval(poller); observer.disconnect(); callback(value);
      };
      const check = () => {
        if (!current()) return finish(reject, new Error('Navigation changed'));
        const value = find();
        if (value) finish(resolve, value);
      };
      observer = new MutationObserver(check);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      timer = setTimeout(() => finish(reject, new Error('Timed out')), timeout);
      poller = setInterval(check, 250);
      check();
    });
  }

  function details() {
    const title = document.querySelector('h1 yt-formatted-string, meta[name="title"]');
    const channel = document.querySelector('ytd-channel-name #text, #owner #text');
    return { title: title && (title.content || title.textContent), channel: channel && channel.textContent };
  }

  function showConnectionError(output, error, controls) {
    if (!/Receiving end does not exist|Could not establish connection|Extension context invalidated/i.test(error?.message || '')) return false;
    output.textContent = 'YouText lost its connection. Reload this page. If it persists, reload the extension and then the page.';
    controls?.querySelector('.reload-action')?.remove();
    const reload = ui.iconButton(document, { icon: '↻', label: 'Reload page', className: 'reload-action' });
    reload.addEventListener('click', () => location.reload());
    (controls || output).append(reload);
    return true;
  }

  function logo() {
    const link = document.createElement('a'); link.className = 'logo brand'; link.href = '/'; link.title = 'YouText home'; link.setAttribute('aria-label', 'YouText home');
    link.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 4.5v23l15-11.5z"/><path d="M18 8h9M18 16h9M18 24h9"/></svg>';
    return link;
  }

  function switchControl(text, checked, onChange) {
    const label = document.createElement('label'); label.className = 'preference-switch';
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = checked; input.setAttribute('role', 'switch');
    const track = document.createElement('span'); track.className = 'switch-track'; track.setAttribute('aria-hidden', 'true');
    const caption = document.createElement('span'); caption.textContent = text;
    input.addEventListener('change', () => onChange(input.checked));
    label.append(input, track, caption); return label;
  }

  function preferenceControls(main) {
    const controls = document.createElement('div'); controls.className = 'preference-controls';
    controls.append(switchControl('YouText', true, (checked) => browser.storage.local.set({ youtextEnabled: checked })));
    const theme = switchControl('Dark mode', true, async (dark) => {
      main.dataset.theme = dark ? 'dark' : 'light';
      await browser.storage.local.set({ youtextTheme: dark ? 'dark' : 'light' });
    });
    controls.append(theme);
    browser.storage?.local?.get('youtextTheme').then(({ youtextTheme }) => {
      const dark = youtextTheme !== 'light'; theme.querySelector('input').checked = dark; main.dataset.theme = dark ? 'dark' : 'light';
    }).catch(() => {});
    return controls;
  }

  function mountNativeToggle() {
    if (document.getElementById('youtext-native-toggle')) return;
    const panel = document.createElement('div'); panel.id = 'youtext-native-toggle';
    panel.append(switchControl('YouText', false, (checked) => browser.storage.local.set({ youtextEnabled: checked })));
    const style = document.createElement('style');
    style.textContent = '#youtext-native-toggle{position:fixed;z-index:2147483647;right:18px;bottom:18px;padding:12px 14px;border:1px solid #46534a;border-radius:12px;background:#181d1a;color:#eef2ee;font:600 14px/1.4 Arial,sans-serif;box-shadow:0 8px 28px #0009}#youtext-native-toggle label{display:flex;align-items:center;gap:10px;cursor:pointer}#youtext-native-toggle input{position:absolute;width:1px;height:1px;margin:-1px;clip:rect(0 0 0 0);clip-path:inset(50%);overflow:hidden}#youtext-native-toggle .switch-track{box-sizing:border-box;width:38px;height:22px;border:1px solid #68736b;border-radius:999px;background:#343b36;transition:background .2s,border-color .2s}#youtext-native-toggle .switch-track::before{content:"";display:block;width:16px;height:16px;margin:2px;border-radius:50%;background:#d7ddd8;box-shadow:0 1px 3px #0008;transition:transform .2s,background .2s}#youtext-native-toggle input:checked+.switch-track{border-color:#8eaf97;background:#8eaf97}#youtext-native-toggle input:checked+.switch-track::before{transform:translateX(16px);background:#101713}#youtext-native-toggle input:focus-visible+.switch-track{outline:3px solid #dccb91;outline-offset:3px}@media(prefers-reduced-motion:reduce){#youtext-native-toggle .switch-track,#youtext-native-toggle .switch-track::before{transition:none}}';
    document.head.append(style); document.body.append(panel);
  }

  function requestGeneration(message, onProgress) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let port;
      try { port = browser.runtime.connect({ name: 'youtext:generation' }); }
      catch (error) { reject(error); return; }
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        port.onMessage.removeListener(receive);
        port.onDisconnect.removeListener(disconnected);
        try { port.disconnect(); } catch { /* Already disconnected. */ }
        callback(value);
      };
      const receive = (response) => {
        if (response.type === 'progress') onProgress(response.text);
        else if (response.type === 'result') finish(resolve, response.result);
        else if (response.type === 'error') finish(reject, new Error(response.message));
      };
      const disconnected = () => finish(reject, new Error('Could not establish connection. Receiving end does not exist.'));
      port.onMessage.addListener(receive);
      port.onDisconnect.addListener(disconnected);
      try { port.postMessage(message); } catch (error) { finish(reject, error); }
    });
  }

  function summaryPanel(paragraphs, cachedSummary) {
    const section = document.createElement('section'); section.className = 'summary';
    const heading = document.createElement('h2'); heading.textContent = 'Summary';
    const status = document.createElement('p'); status.className = 'summary-status';
    const articleAction = ui.iconButton(document, { icon: '↗', label: 'Read more', className: 'summary-action read-more-action' }); articleAction.disabled = true;
    const articleResult = document.createElement('div'); articleResult.className = 'article-result';
    const controls = document.createElement('div'); controls.className = 'summary-actions'; controls.append(articleAction);
    status.setAttribute('role', 'status'); articleResult.setAttribute('aria-live', 'polite');
    async function generate(article = false) {
      const activeAction = article ? articleAction : null;
      ui.setLoading(activeAction, true);
      articleAction.disabled = true;
      const output = article ? articleResult : status;
      output.textContent = 'Generating…';
      try {
        const result = await requestGeneration(
          { type: article ? 'youtext:article' : 'youtext:summarize', videoId: videoId(), paragraphs, model: '', allowFallback: true },
          (text) => { output.textContent = text; }
        );
        const list = document.createElement(article ? 'div' : 'ul');
        (article ? result.paragraphs : result.bullets).forEach((text) => { const item = document.createElement(article ? 'p' : 'li'); item.textContent = text; list.append(item); });
        output.replaceChildren(list);
        output.className = article ? 'article-result' : 'summary-result';
      } catch (error) {
        if (showConnectionError(output, error, controls)) return;
        output.textContent = error.message || 'Could not generate content.';
        const retry = ui.iconButton(document, { icon: '↻', label: 'Try again' });
        retry.addEventListener('click', () => generate(article)); output.append(' ', retry);
        if (/API key/i.test(output.textContent)) {
          const settings = ui.iconButton(document, { icon: '⚙', label: 'Open settings', className: 'summary-link' });
          settings.addEventListener('click', () => browser.runtime.openOptionsPage()); output.append(' ', settings);
        }
      } finally {
        ui.setLoading(activeAction, false);
        articleAction.disabled = false;
      }
    }
    articleAction.addEventListener('click', () => generate(true));
    section.append(heading, status, articleResult, controls);
    if (cachedSummary?.bullets?.length) {
      const list = document.createElement('ul');
      cachedSummary.bullets.forEach((text) => { const item = document.createElement('li'); item.textContent = text; list.append(item); });
      status.replaceChildren(list); status.className = 'summary-result'; articleAction.disabled = !paragraphs.length;
    } else generate();
    return section;
  }

  function titleList(title, videos) {
    const section = document.createElement('section'); section.className = 'video-list';
    const heading = document.createElement('h2'); heading.textContent = title;
    const list = document.createElement('ul');
    videos.forEach((video) => { const item = document.createElement('li'); item.append(videoLabel(video), laterButton(video, false)); list.append(item); });
    section.append(heading, list); return section;
  }

  function videoLabel(video) {
    const info = document.createElement('div'); info.className = 'video-info';
    const link = document.createElement('a'); link.href = video.href; link.textContent = api.titleSentenceCase(video.title); info.append(link);
    if (video.channel) { const channel = document.createElement('small'); channel.className = 'video-channel'; channel.textContent = video.channel; info.append(channel); }
    return info;
  }

  function laterButton(video, remove) {
    const button = ui.iconButton(document, {
      icon: remove ? '×' : '+',
      label: `${remove ? 'Remove from' : 'Add to'} Read later: ${video.title}`,
      className: 'icon-action'
    });
    if (!remove) isInReadLater(video.href).then((saved) => { button.hidden = saved; }).catch(() => {});
    button.addEventListener('click', async () => {
      ui.setLoading(button, true);
      try {
        if (remove && video.removeAction) await globalThis.YouTextWatchLater.remove(video);
        else await globalThis.YouTextFeedback.watchLater(document, video.href, remove);
        button.textContent = '✓'; button.setAttribute('aria-label', remove ? 'Removed from Read later' : 'Added to Read later');
        ui.toast(document, remove ? 'Removed from Read later.' : 'Added to Read later.', 'success');
        if (remove) button.closest('li')?.remove();
        else button.hidden = true;
      } catch (error) { ui.toast(document, error.message || 'Could not complete the action.', 'error', 5000); }
      finally { ui.setLoading(button, false); }
    });
    return button;
  }

  function isInReadLater(href) {
    if (!globalThis.YouTextWatchLater?.load) return Promise.resolve(false);
    const idFrom = (value) => new URLSearchParams(String(value || '').split('?')[1] || '').get('v');
    const target = idFrom(href);
    return globalThis.YouTextWatchLater.load().then((result) => result.videos.some((video) => idFrom(video.href) === target));
  }

  function videoActions() {
    const section = document.createElement('nav'); section.className = 'video-actions'; section.setAttribute('aria-label', 'Video actions');
    const id = videoId();
    const markReadAndRemove = async () => {
      await globalThis.YouTextFeedback.markRead(id);
      try {
        const result = await globalThis.YouTextWatchLater.load();
        const saved = result.videos.find((video) => new URL(video.href, location.origin).searchParams.get('v') === id);
        if (saved) await globalThis.YouTextWatchLater.remove(saved);
      } catch (error) {
        error.readSaved = true;
        throw error;
      }
    };
    const actions = [
      ['👍', 'Like', () => globalThis.YouTextFeedback.like(document, true), 'like'],
      ['👎', 'Dislike', () => globalThis.YouTextFeedback.like(document, false), 'dislike'],
      ['＋', 'Add to Read later', () => globalThis.YouTextFeedback.currentWatchLater(document), 'later'],
      ['✓', 'Mark as read', markReadAndRemove, 'read']
    ];
    const buttons = {};
    const setActive = (button, active) => { button.classList.toggle('done', active); button.setAttribute('aria-pressed', String(active)); };
    actions.forEach(([icon, label, action, key]) => {
      const button = ui.iconButton(document, { icon, label, className: 'icon-action' });
      buttons[key] = button; setActive(button, false);
      const showRead = () => { setActive(button, true); button.title = 'Already read'; button.setAttribute('aria-label', 'Already read'); };
      if (label === 'Mark as read') globalThis.YouTextFeedback?.isRead?.(id).then((read) => { if (read) showRead(); }).catch(() => {});
      if (key === 'later') isInReadLater(`/watch?v=${id}`).then((saved) => { button.hidden = saved; }).catch(() => {});
      button.addEventListener('click', async () => { const wasActive = button.getAttribute('aria-pressed') === 'true'; ui.setLoading(button, true); try { await action(); if (key === 'read') showRead(); else if (key === 'later') button.hidden = true; else { setActive(button, !wasActive); setActive(buttons[key === 'like' ? 'dislike' : 'like'], false); } ui.toast(document, `${label} completed.`, 'success'); } catch (error) { if (error.readSaved) showRead(); ui.toast(document, error.readSaved ? `Marked as read, but Read later could not be updated. ${error.message}` : error.message || 'Could not complete the action.', 'error', 5000); } finally { ui.setLoading(button, false); } });
      section.append(button);
    });
    const reactions = globalThis.YouTextFeedback?.reactionState?.(document) || {};
    setActive(buttons.like, Boolean(reactions.like)); setActive(buttons.dislike, Boolean(reactions.dislike));
    return section;
  }

  function clearHome() {
    listing = null;
    document.getElementById('youtext-home')?.remove();
    document.getElementById('youtext-home-style')?.remove();
  }

  function homeVideos() {
    return api.listingVideos(document);
  }

  function searchBar() {
    const form = document.createElement('form'); form.className = 'search-form'; form.setAttribute('action', '/results'); form.setAttribute('method', 'get'); form.setAttribute('role', 'search');
    const input = document.createElement('input'); input.type = 'search'; input.name = 'search_query'; input.placeholder = 'YouText'; input.setAttribute('aria-label', 'Search videos'); input.required = true;
    input.value = new URLSearchParams(location.search).get('search_query') || '';
    const button = ui.iconButton(document, { icon: '', label: 'Search', type: 'submit', className: 'search-action' });
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>';
    form.append(input, button); return form;
  }

  function renderHome(videos) {
    document.documentElement.removeAttribute('data-youtext-loading');
    document.documentElement.removeAttribute('data-youtext-status');
    clearHome();
    document.title = 'YouText';
    const host = document.createElement('div'); host.id = 'youtext-home';
    const root = host.attachShadow({ mode: 'open' });
    const main = document.createElement('main');
    const list = document.createElement('ul');
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    const update = (items) => {
      const signature = JSON.stringify(items);
      if (listing?.signature === signature) return;
      list.replaceChildren();
      items.forEach((video) => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      item.append(videoLabel(video), laterButton(video, false)); list.append(item);
      });
      status.textContent = items.length ? '' : 'No titles available yet. Search above or wait for the page to load.';
      listing.signature = signature;
    };
    const style = document.createElement('style'); style.id = 'youtext-home-style';
    style.textContent = 'html{background:#111315!important}body{visibility:hidden!important}#youtext-home{visibility:visible!important;display:block;position:fixed;z-index:2147483647;inset:0;overflow:auto;box-sizing:border-box;background:#111315}';
    const contentStyle = document.createElement('style');
    contentStyle.textContent = ':host{display:block}main{box-sizing:border-box;min-height:100%;margin:0;padding:32px max(24px,calc((100vw - 70ch)/2));color:#e8e5df;background:#111315;font:18px/1.6 "Atkinson Hyperlegible",Verdana,Arial,sans-serif}ul{margin:0;padding:0;list-style:none}li{padding:11px 0;border-bottom:1px solid #292d32}a{color:#f2b0ac;text-decoration:none}a:hover{text-decoration:underline}a:focus-visible{outline:3px solid #ffd166;outline-offset:3px}';
    contentStyle.textContent += 'form{display:flex;align-items:center;gap:10px;margin-bottom:24px}input{box-sizing:border-box;min-width:0;height:42px;flex:1}input,button{font:inherit;padding:10px;border:1px solid #666;border-radius:4px;background:#1d2024;color:#eee}button{cursor:pointer}p{font-size:16px;color:#b8b2a8}.search-action svg{display:block;width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}';
    contentStyle.textContent += '.watched-action,.icon-action{font-size:18px;padding:3px 8px;line-height:1;min-width:30px}li{display:flex;align-items:center;gap:16px}.video-info{min-width:0;flex:1}.video-info a,.video-channel{display:block}.video-channel{margin-top:2px;color:#b8beb5;font-size:14px}li [role="status"]{display:block;font-size:16px;color:#b8b2a8}';
    contentStyle.textContent += ':host,main{background:#171c19;color:#e9e7df}.logo{display:flex;align-items:center;gap:9px;width:max-content;margin:0 0 28px;padding:12px 0;color:#b8d1bd;background:#171c19;font-weight:700}.logo svg{width:30px;height:30px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}.logo svg path:first-child{fill:#b8d1bd;stroke:none}.icon-button{box-sizing:border-box;display:inline-grid;place-items:center;width:42px;height:42px;min-width:42px;min-height:42px;aspect-ratio:1;flex:0 0 42px;padding:8px;border:1px solid #46534a;border-radius:50%;background:#202722;color:#e9e7df;cursor:pointer}li{border-color:#303832}a{color:#b8d1bd}input,button{background:#202722;border-color:#46534a;color:#e9e7df}button:hover{background:#29332c}.youtext-toasts{position:fixed;z-index:10;right:24px;bottom:24px;max-width:min(420px,calc(100vw - 48px))}.youtext-toast{padding:12px 16px;border:1px solid #607066;border-radius:6px;background:#202722;color:#e9e7df;box-shadow:0 8px 28px #0008}.youtext-toast-error{border-color:#d66;color:#ffd9d7}.youtext-toast-success{border-color:#71947a;color:#d9f0df}';
    contentStyle.textContent += '.is-loading{position:relative;color:transparent!important;pointer-events:none}.is-loading::after{content:"";position:absolute;top:calc(50% - 10px);left:calc(50% - 10px);width:16px;height:16px;border:2px solid #46534a;border-top-color:#a8c8ae;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}';
    main.append(logo(), searchBar());
    if (location.pathname === '/') main.append(watchLaterPanel());
    main.append(status, list); root.append(contentStyle, main);
    document.head.append(style); document.documentElement.append(host);
    listing = { host, style, update, key: location.pathname + location.search };
    update(videos);
  }

  function watchLaterPanel() {
    const section = document.createElement('section'); section.className = 'watch-later';
    const heading = document.createElement('h2'); heading.textContent = 'Read later';
    heading.style.fontSize = '20px';
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    const list = document.createElement('ul');
    const recommendations = document.createElement('h2'); recommendations.textContent = 'Recommended'; recommendations.style.fontSize = '20px';
    async function update() {
      status.textContent = 'Loading Read later…';
      try {
        const result = await globalThis.YouTextWatchLater.load();
        list.replaceChildren();
        for (const video of result.videos) {
          const item = document.createElement('li'); const link = document.createElement('a');
          link.href = video.href; link.textContent = api.titleSentenceCase(video.title); item.append(link, laterButton(video, true)); list.append(item);
        }
        status.textContent = result.partial ? 'Showing the first part of the list.' : result.videos.length ? '' : 'No videos in Read later.';
      } catch (error) {
        const message = error.name === 'AbortError' ? 'YouTube took too long to respond. Try refreshing the list.' : error.message;
        status.textContent = list.children.length ? 'Previous titles remain below.' : '';
        ui.toast(document, message, 'error', 5000);
      }
    }
    section.append(heading, status, list, recommendations);
    update(); return section;
  }

  function recommendedVideos() {
    const root = document.querySelector('ytd-watch-next-secondary-results-renderer, #related');
    return api.listingVideos(root || document).filter((video) => video.href !== `/watch?v=${videoId()}`);
  }

  function render({ title, channel, paragraphs = [], recommendations, error, cachedSummary }) {
    clearHome();
    document.documentElement.removeAttribute('data-youtext-loading');
    document.documentElement.removeAttribute('data-youtext-status');
    document.querySelector('main.youtext')?.remove();
    const displayTitle = api.titleSentenceCase(title || 'YouTube video');
    document.title = `${displayTitle} · YouText`;
    const main = document.createElement('main'); main.className = 'youtext';
    const topbar = document.createElement('div'); topbar.className = 'topbar'; topbar.append(logo(), searchBar(), preferenceControls(main));
    const header = document.createElement('header');
    const heading = document.createElement('h1'); heading.textContent = displayTitle;
    const byline = document.createElement('p'); byline.className = 'channel'; byline.textContent = api.titleSentenceCase(channel || '');
    header.append(heading, byline);
    const article = document.createElement('article');
    if (error) { const message = document.createElement('p'); message.className = 'empty'; message.textContent = error; article.append(message); }
    else paragraphs.forEach((paragraph) => { const node = document.createElement('p'); node.className = 'speech'; node.textContent = api.sentenceCase(paragraph); article.append(node); });
    main.append(topbar, header);
    if (paragraphs.length || cachedSummary) main.append(summaryPanel(paragraphs, cachedSummary));
    main.append(videoActions());
    if (error) main.append(article);
    else {
      const transcript = document.createElement('details'); transcript.className = 'transcript';
      const toggle = document.createElement('summary'); toggle.textContent = 'Transcript';
      transcript.append(toggle, article); main.append(transcript);
    }
    main.append(titleList('Recommended', recommendations || []));
    if (!recommendations?.length) {
      const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'No recommended videos available.';
      main.querySelector('.video-list').append(empty);
    }
    const style = document.createElement('style');
    style.textContent = 'body{margin:0;background:#111315;color:#e8e5df;font:18px/1.6 "Atkinson Hyperlegible",Verdana,Arial,sans-serif}.youtext{max-width:70ch;margin:0 auto;padding:64px 24px 96px}.brand{font:700 16px/1.4 "Atkinson Hyperlegible",Verdana,Arial,sans-serif;color:#ff8b85;text-decoration:none}.brand:hover{text-decoration:underline}h1{font:700 2.35rem/1.2 "Atkinson Hyperlegible",Verdana,Arial,sans-serif;margin:14px 0 8px;color:#fff}.channel{font:16px/1.5 "Atkinson Hyperlegible",Verdana,Arial,sans-serif;color:#b8b2a8;margin:0}.summary,.video-list{margin-top:38px;padding:22px 24px;background:#1d2024;border-left:4px solid #ff625c}.summary h2,.video-list h2{font:700 1.1rem/1.4 "Atkinson Hyperlegible",Verdana,Arial,sans-serif;margin:0 0 14px;color:#fff}.summary label,.summary select{display:block;font:16px/1.5 "Atkinson Hyperlegible",Verdana,Arial,sans-serif}.summary select{width:100%;margin:6px 0 12px;padding:8px;background:#111315;border:1px solid #666;border-radius:4px;color:#eee}.summary-action,.summary-link{border:0;border-radius:4px;background:#d93632;color:#fff;padding:9px 13px;font:700 16px/1.4 "Atkinson Hyperlegible",Verdana,Arial,sans-serif;cursor:pointer}.summary-action:disabled,.summary select:disabled{opacity:.6;cursor:wait}.summary-action:focus-visible,.summary-link:focus-visible,a:focus-visible,.summary select:focus-visible{outline:3px solid #ffd166;outline-offset:3px}.summary-link{display:inline;padding:3px 6px}.summary-status{font:16px/1.5 "Atkinson Hyperlegible",Verdana,Arial,sans-serif;color:#b8b2a8;margin:12px 0 0}.summary-result{font:18px/1.6 "Atkinson Hyperlegible",Verdana,Arial,sans-serif;margin:12px 0 0}.summary-result ul,.video-list ul{margin:0;padding-left:22px}.summary-result li{margin:0 0 7px}.video-list li{margin:0 0 10px}.video-list a{color:#f2b0ac;text-decoration:none}.video-list a:hover{text-decoration:underline}article{margin-top:44px}.speech{margin:0 0 .8em;padding:0 0 .8em;border-bottom:1px solid #292d32}.speech:last-child{border-bottom:0}.empty{font-family:"Atkinson Hyperlegible",Verdana,Arial,sans-serif;color:#b8b2a8}';
    style.textContent += '.brand{display:inline-block;padding:10px 14px;border:1px solid #666;border-radius:4px;color:#f2b0ac}.summary-actions{display:flex;align-items:center;gap:8px;margin-top:12px}.summary-actions .icon-button{margin:0}.summary-action:disabled{opacity:.6;cursor:wait}.transcript{margin-top:28px}.transcript summary{cursor:pointer;font:600 18px/1.5 "Atkinson Hyperlegible",Verdana,Arial,sans-serif}.transcript summary:focus-visible{outline:3px solid #ffd166;outline-offset:3px}.transcript article{margin-top:14px;line-height:1.6}.speech{margin:0 0 .6em;padding:0;border:0}.article-result{font:18px/1.6 "Atkinson Hyperlegible",Verdana,Arial,sans-serif}.article-result p{margin:1em 0 0}.video-list{margin-top:32px;padding:0;background:transparent;border:0;font:18px/1.6 "Atkinson Hyperlegible",Verdana,Arial,sans-serif}.video-list ul{margin:0;padding:0;list-style:none}.video-list li{display:flex;align-items:center;gap:16px;margin:0;padding:11px 0;border-bottom:1px solid #292d32}.video-info{min-width:0;flex:1}.video-info a,.video-channel{display:block}.video-channel{margin-top:2px;color:#b8beb5;font-size:14px}.youtext form{display:flex;align-items:center;gap:10px;margin-bottom:24px}.youtext input{box-sizing:border-box;min-width:0;height:42px;flex:1}.youtext input,.youtext form button{font:16px/1.5 "Atkinson Hyperlegible",Verdana,Arial,sans-serif;padding:10px;border:1px solid #666;border-radius:4px;background:#1d2024;color:#eee}.search-action svg{display:block;width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}';
    style.textContent += 'body> :not(main.youtext){visibility:hidden!important}main.youtext{position:fixed;inset:0;z-index:2147483647;overflow:auto;box-sizing:border-box;background:#111315;width:100%;max-width:none;padding:40px max(24px,calc((100vw - 70ch)/2)) 96px;visibility:visible!important}.watched-action,.icon-action{font:18px/1.4 "Atkinson Hyperlegible",Verdana,Arial,sans-serif;padding:3px 8px;margin-left:12px;background:#1d2024;color:#eee;border:1px solid #666;border-radius:4px;cursor:pointer}.video-list [role="status"]{display:block;font:16px/1.5 "Atkinson Hyperlegible",Verdana,Arial,sans-serif;color:#b8b2a8}';
    style.textContent += 'body,main.youtext{background:#171c19;color:#e9e7df}.logo{display:flex;align-items:center;gap:9px;width:max-content;margin-bottom:20px;padding:12px 0;border:0;color:#b8d1bd;background:#171c19;text-decoration:none;font-weight:700}.logo svg{width:32px;height:32px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}.logo svg path:first-child{fill:#b8d1bd;stroke:none}.logo:hover{color:#d0e2d3;text-decoration:none}h1{color:#f4f1e9}.channel,.summary-status,.empty,.video-list [role="status"]{color:#b8beb5}.summary{margin-top:18px;padding:0;border:0;background:transparent;color:#b8beb5;font-size:16px}.summary h2{margin-bottom:8px;color:#b8beb5;font-size:1rem;font-weight:600}.summary-result{font-size:16px;line-height:1.5}.video-list{border:0}.summary select,.youtext input,.youtext form button,.icon-button{background:#202722;border-color:#46534a;color:#e9e7df}.summary-action,.icon-button.done{background:#8eaf97;color:#101713;border-color:#8eaf97}.summary-action:hover{background:#a5c3ac}.icon-button,.youtext form .icon-button{box-sizing:border-box;display:inline-grid;place-items:center;width:42px;height:42px;min-width:42px;min-height:42px;aspect-ratio:1;flex:0 0 42px;padding:8px;margin:0 6px 6px 0;border:1px solid #46534a;border-radius:50%;font:18px/1 "Atkinson Hyperlegible",Verdana,Arial,sans-serif;cursor:pointer}.youtext form .search-action{margin:0}.icon-button:hover,.youtext form button:hover{background:#29332c}.video-actions{margin-top:22px}.video-list li{border-color:#303832}.video-list a,a{color:#b8d1bd}.speech{color:#e9e7df}.summary-action:focus-visible,.summary-link:focus-visible,a:focus-visible,.summary select:focus-visible{outline-color:#dccb91}';
    style.textContent += '.is-loading{position:relative;color:transparent!important;pointer-events:none}.is-loading::after{content:"";position:absolute;top:calc(50% - 10px);left:calc(50% - 10px);width:16px;height:16px;border:2px solid #46534a;border-top-color:#a8c8ae;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.youtext-toasts{position:fixed;z-index:10;right:24px;bottom:24px;max-width:min(420px,calc(100vw - 48px))}.youtext-toast{padding:12px 16px;border:1px solid #607066;border-radius:6px;background:#202722;color:#e9e7df;box-shadow:0 8px 28px #0008}.youtext-toast-error{border-color:#d66;color:#ffd9d7}.youtext-toast-success{border-color:#71947a;color:#d9f0df}@media(prefers-reduced-motion:reduce){.is-loading::after{animation-duration:1.5s}}';
    style.textContent += '.topbar{display:flex;align-items:center;gap:24px;margin-bottom:24px}.topbar .logo{flex:0 0 auto;margin:0}.topbar form{flex:1;margin:0}@media(max-width:520px){.topbar{gap:12px}.logo span{display:none}}';
    style.textContent += '.preference-controls{display:flex;align-items:center;gap:16px;flex:0 0 auto}.preference-switch{position:relative;display:flex;align-items:center;gap:8px;color:#b8beb5;font:14px/1.4 "Atkinson Hyperlegible",Verdana,Arial,sans-serif;white-space:nowrap;cursor:pointer}.preference-switch input{position:absolute;width:1px;height:1px;margin:-1px;clip:rect(0 0 0 0);clip-path:inset(50%);overflow:hidden}.switch-track{box-sizing:border-box;width:38px;height:22px;flex:0 0 38px;border:1px solid #68736b;border-radius:999px;background:#343b36;transition:background .2s,border-color .2s}.switch-track::before{content:"";display:block;width:16px;height:16px;margin:2px;border-radius:50%;background:#d7ddd8;box-shadow:0 1px 3px #0008;transition:transform .2s,background .2s}.preference-switch input:checked+.switch-track{border-color:#8eaf97;background:#8eaf97}.preference-switch input:checked+.switch-track::before{transform:translateX(16px);background:#101713}.preference-switch input:focus-visible+.switch-track{outline:3px solid #dccb91;outline-offset:3px}main.youtext[data-theme="light"]{background:#f7f6f1;color:#20251f}main.youtext[data-theme="light"] h1{color:#151a16}main.youtext[data-theme="light"] .channel,main.youtext[data-theme="light"] .summary,main.youtext[data-theme="light"] .summary h2,main.youtext[data-theme="light"] .summary-status,main.youtext[data-theme="light"] .empty,main.youtext[data-theme="light"] .preference-switch{color:#59635b}main.youtext[data-theme="light"] .logo{background:#f7f6f1;color:#42694c}main.youtext[data-theme="light"] .youtext-input,main.youtext[data-theme="light"] form button,main.youtext[data-theme="light"] .icon-button{background:#fff;border-color:#aab4ac;color:#20251f}main.youtext[data-theme="light"] a{color:#356b45}main.youtext[data-theme="light"] .speech,main.youtext[data-theme="light"] .video-list li{border-color:#d7ddd8;color:#20251f}@media(prefers-reduced-motion:reduce){.switch-track,.switch-track::before{transition:none}}@media(max-width:760px){.topbar{flex-wrap:wrap}.topbar form{order:3;flex-basis:100%}.preference-controls{margin-left:auto}}';
    document.head.append(style); document.body.append(main);
  }

  async function openNativeTranscript(isCurrent) {
    let clicked = false;
    let expanded = false;
    return waitFor(() => {
      const paragraphs = api.extractSegments(api.transcriptSegments(document));
      if (paragraphs.length) return paragraphs;
      if (!clicked) {
        const button = api.transcriptButton(document);
        if (button) { clicked = true; button.click(); }
        else if (!expanded) {
          const expand = document.querySelector('ytd-watch-metadata #description-inline-expander #expand, ytd-text-inline-expander #expand');
          if (expand) { expanded = true; expand.click(); }
        }
      }
      return null;
    }, { current: isCurrent });
  }

  async function showTranscript(id) {
    if (renderedVideoId === id || pendingVideoId === id) return;
    pendingVideoId = id;
    const version = ++routeVersion;
    const isCurrent = () => version === routeVersion && videoId() === id;
    document.documentElement.dataset.youtextLoading = 'true';
    document.documentElement.dataset.youtextStatus = 'Opening video…';
    let cachedSummary;
    try {
      cachedSummary = await browser.runtime.sendMessage({ type: 'youtext:cached-summary', videoId: id });
    } catch { /* Cache lookup failure must not block transcript loading. */ }
    if (!isCurrent()) return;
    if (cachedSummary) {
      renderedVideoId = id;
      render({ ...details(), paragraphs: [], recommendations: recommendedVideos(), cachedSummary });
    }
    const transcriptStatus = setTimeout(() => {
      if (isCurrent() && !cachedSummary) document.documentElement.dataset.youtextStatus = 'Loading transcript…';
    }, 350);
    let paragraphs;
    let captureError;
    try {
      paragraphs = await openNativeTranscript(isCurrent);
    } catch (error) {
      if (!isCurrent()) return;
      console.warn('[YouText] Native transcript unavailable:', error);
      captureError = 'Transcript unavailable for this video.';
    } finally {
      clearTimeout(transcriptStatus);
      if (version === routeVersion) pendingVideoId = null;
    }
    if (!isCurrent()) return;
    renderedVideoId = id;
    render({ ...details(), paragraphs, recommendations: recommendedVideos(), error: captureError, cachedSummary });
  }

  function showHome() {
    if (!document.head || !document.body) return;
    if (!listing || listing.key !== location.pathname + location.search) {
      routeVersion++;
      pendingVideoId = null;
      renderedVideoId = null;
      renderHome(homeVideos());
    } else {
      if (!listing.host.isConnected) document.documentElement.append(listing.host);
      if (!listing.style.isConnected) document.head.append(listing.style);
      listing.update(homeVideos());
    }
  }

  function route() {
    const id = videoId();
    if (id) { clearHome(); showTranscript(id); }
    else if (location.pathname === '/' || location.pathname === '/results') showHome();
    else {
      routeVersion++;
      pendingVideoId = null;
      clearHome();
      document.documentElement.removeAttribute('data-youtext-loading');
      document.documentElement.removeAttribute('data-youtext-status');
    }
  }

  function start() {
    appendStyle();
    new MutationObserver(playSilently).observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('yt-navigate-finish', route);
    setInterval(playSilently, 1000);
    setInterval(() => { if (location.pathname === '/' || location.pathname === '/results') showHome(); }, 500);
    route();
  }

  function initialize() {
    let enabled;
    let reloading = false;
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.youtextEnabled || reloading) return;
      const next = changes.youtextEnabled.newValue !== false;
      if (enabled === undefined) { enabled = next; return; }
      if (next === enabled) return;
      reloading = true;
      routeVersion++;
      // Rendering replaces the native page: reload to restore YouTube completely.
      location.reload();
    });
    browser.storage.local.get('youtextEnabled').then((settings) => {
      enabled ??= settings.youtextEnabled !== false;
      if (enabled) start();
      else mountNativeToggle();
    }).catch((error) => { console.warn('[YouText] Could not read enabled setting:', error); });
  }
  initialize();
})();
