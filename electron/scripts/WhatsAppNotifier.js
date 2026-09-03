// Robust WhatsApp new-message detector for New WS.
// It intentionally avoids unstable WhatsApp CSS class names.
(() => {
  if (window.__NEW_WS_STRONG_NOTIFIER_V1__) return;
  window.__NEW_WS_STRONG_NOTIFIER_V1__ = true;

  const state = {
    primed: false,
    lastUnread: 0,
    chatKey: '',
    chatStableSince: 0,
    knownIncoming: new Set(),
    lastEmitAt: 0,
    scanTimer: null,
  };

  const unreadWords = /(未读|unread|no leído|non lu|ungelesen|não lid|não lida|непрочитан|未讀)/i;

  function emit(reason) {
    const now = Date.now();
    if (now - state.lastEmitAt < 1800) return;
    state.lastEmitAt = now;
    try {
      const p = window.electronAPI && window.electronAPI.newMsgNotify &&
        window.electronAPI.newMsgNotify({ platform: 'WhatsApp', reason });
      if (p && typeof p.catch === 'function') p.catch(() => {});
      console.log('[NewWS StrongNotifier] message detected:', reason);
    } catch (e) {
      console.warn('[NewWS StrongNotifier] notify failed', e);
    }
  }

  function parseCount(text) {
    const m = String(text || '').match(/\d+/);
    return m ? Math.max(1, parseInt(m[0], 10) || 1) : 1;
  }

  function greenish(el) {
    let cur = el;
    for (let i = 0; cur && i < 4; i++, cur = cur.parentElement) {
      try {
        const bg = getComputedStyle(cur).backgroundColor;
        const m = bg && bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
        if (m) {
          const r = +m[1], g = +m[2], b = +m[3];
          if (g > 105 && g > r * 1.22 && g > b * 1.08) return true;
        }
      } catch (_) {}
    }
    return false;
  }

  function unreadTotal() {
    const pane = document.getElementById('pane-side');
    if (!pane) return 0;
    let total = 0;
    const counted = new Set();

    pane.querySelectorAll('[aria-label]').forEach((el) => {
      const label = el.getAttribute('aria-label') || '';
      if (!unreadWords.test(label)) return;
      const row = el.closest('[role="listitem"],[role="row"]') || el.parentElement;
      const key = row || el;
      if (counted.has(key)) return;
      counted.add(key);
      total += parseCount(label);
    });

    const rows = pane.querySelectorAll('[role="listitem"],[role="row"]');
    rows.forEach((row) => {
      if (counted.has(row)) return;
      let best = 0;
      row.querySelectorAll('span,div').forEach((el) => {
        const t = (el.textContent || '').trim();
        if (!/^\d{1,3}$/.test(t)) return;
        if (!greenish(el)) return;
        best = Math.max(best, parseInt(t, 10) || 1);
      });
      if (best > 0) total += best;
    });
    return total;
  }

  function currentChatKey() {
    const header = document.querySelector('#main header');
    if (!header) return '';
    const text = (header.innerText || header.textContent || '').replace(/\s+/g, ' ').trim();
    return text.slice(0, 180);
  }

  function incomingIds() {
    const main = document.getElementById('main');
    if (!main) return [];
    const ids = new Set();
    main.querySelectorAll('[data-id^="false_"], .message-in [data-id], [data-testid="msg-container"][data-id^="false_"]').forEach((el) => {
      const holder = el.matches('[data-id]') ? el : el.closest('[data-id]');
      const id = holder && holder.getAttribute('data-id');
      if (id && (id.startsWith('false_') || el.closest('.message-in'))) ids.add(id);
    });
    return Array.from(ids);
  }

  function scan() {
    const now = Date.now();
    const unread = unreadTotal();
    const key = currentChatKey();
    const ids = incomingIds();

    if (!state.primed) {
      state.primed = true;
      state.lastUnread = unread;
      state.chatKey = key;
      state.chatStableSince = now;
      state.knownIncoming = new Set(ids);
      return;
    }

    if (unread > state.lastUnread) emit('unread-increased');
    state.lastUnread = unread;

    if (key !== state.chatKey) {
      state.chatKey = key;
      state.chatStableSince = now;
      state.knownIncoming = new Set(ids);
      return;
    }

    let hasNewIncoming = false;
    for (const id of ids) {
      if (!state.knownIncoming.has(id)) {
        state.knownIncoming.add(id);
        hasNewIncoming = true;
      }
    }
    if (hasNewIncoming && now - state.chatStableSince > 1800) emit('incoming-message');
  }

  function scheduleScan() {
    clearTimeout(state.scanTimer);
    state.scanTimer = setTimeout(scan, 120);
  }

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-label', 'data-id']
  });

  setInterval(scan, 900);
  setTimeout(scan, 800);
  console.log('[NewWS StrongNotifier] detector installed');
})();
