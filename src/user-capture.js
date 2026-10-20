// Capture le userId + username du user affiché (réponse de GET /user) pour l'historique.
// Monde MAIN, document_start. N'altère pas les réponses : lecture seule.
(() => {
  if (window.__mpgcuCapture) return; window.__mpgcuCapture = true;
  const isUserUrl = u => { try { const x = new URL(u, location.href); return /(^|\.)api\./.test(x.hostname) && /\/user\/?$/.test(x.pathname); } catch { return false; } };
  const store = j => {
    if (!j || typeof j !== 'object') return;
    const id = j.id || j.userId || j._id;
    const username = j.username || j.alias || j.teamName;
    if (id) try { localStorage.setItem('mpgcu_viewedUser', JSON.stringify({ id, username, ts: Date.now() })); } catch {}
  };
  const of = window.fetch;
  window.fetch = function (input, init) {
    const p = of.apply(this, arguments);
    try {
      const url = typeof input === 'string' ? input : input && input.url;
      if (isUserUrl(url)) p.then(r => r.clone().json()).then(store).catch(() => {});
    } catch {}
    return p;
  };
  const oo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, url) {
    if (isUserUrl(String(url))) this.addEventListener('load', () => {
      try { store(this.responseType === 'json' ? this.response : JSON.parse(this.responseText)); } catch {}
    });
    return oo.apply(this, arguments);
  };
})();
