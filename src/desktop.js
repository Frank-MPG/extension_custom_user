// Force la version "Bureau" de MPG quelle que soit la largeur de la fenêtre.
// Tourne dans le monde MAIN, au document_start, avant le code de l'app.
(() => {
  if (window.__mpgForceDesktop) return;
  // Réglage miroir écrit par content.js (chrome.storage n'est pas lisible ici de façon synchrone)
  try { if (localStorage.getItem('mpgcu_forceDesktop') === '0') return; } catch (e) {}
  window.__mpgForceDesktop = true;
  const MIN = 1280;     // breakpoint desktop de l'app (min-width: 1280px)
  const MIN_ZOOM = 0.5; // en dessous (fenêtre < 640px), on garde le zoom à 50% et on scrolle horizontalement

  const desc = (o, p) => Object.getOwnPropertyDescriptor(o, p);
  const realInner = desc(window, 'innerWidth') ? desc(window, 'innerWidth').get.bind(window) : () => document.documentElement.clientWidth;
  const realW = () => realInner();
  const fakeW = () => Math.max(realW(), MIN);

  // ---------- JS : largeur vue par l'app ----------
  const fake = (obj, prop, getter) => { try { Object.defineProperty(obj, prop, { configurable: true, get: getter }); } catch (e) {} };
  const outer = desc(window, 'outerWidth');
  fake(window, 'innerWidth', fakeW);
  fake(window, 'outerWidth', () => Math.max(outer ? outer.get.call(window) : 0, MIN));
  const cw = desc(Element.prototype, 'clientWidth');
  fake(Element.prototype, 'clientWidth', function () {
    const v = cw.get.call(this);
    return this === document.documentElement ? Math.max(v, MIN) : v;
  });
  if (window.VisualViewport) {
    const vw = desc(VisualViewport.prototype, 'width');
    fake(VisualViewport.prototype, 'width', function () { return Math.max(vw.get.call(this), MIN / (this.scale || 1)); });
  }

  // ---------- Évaluation des media queries de largeur ----------
  const WIDTH_RE = /^\(\s*(?:(min|max)-width\s*:\s*([\d.]+)px|width\s*(<=|>=|<|>|=)\s*([\d.]+)px)\s*\)$/i;
  function evalPart(part, w) {
    const m = part.trim().match(WIDTH_RE);
    if (!m) return null; // pas une condition de largeur
    if (m[1]) { const n = +m[2]; return m[1].toLowerCase() === 'min' ? w >= n : w <= n; }
    const n = +m[4];
    return { '<=': w <= n, '>=': w >= n, '<': w < n, '>': w > n, '=': w === n }[m[3]];
  }
  function rewrite(text, w) {
    if (!/width/i.test(text)) return text;
    return text.split(',').map(q => {
      q = q.trim();
      if (/^not\b/i.test(q)) return q;
      const parts = q.split(/\s+and\s+/i), keep = [];
      for (const p of parts) {
        const r = evalPart(p, w);
        if (r === false) return 'not all';
        if (r === null) keep.push(p.trim());
      }
      return keep.length ? keep.join(' and ') : 'all';
    }).join(', ');
  }

  // matchMedia
  const realMM = window.matchMedia.bind(window);
  window.matchMedia = q => realMM(rewrite(String(q), fakeW()));

  // ---------- CSS : réécriture des @media ----------
  const original = new WeakMap();
  function processRules(rules, w) {
    for (const r of rules) {
      if (r instanceof CSSMediaRule) {
        if (!original.has(r)) original.set(r, r.media.mediaText);
        const next = rewrite(original.get(r), w);
        if (r.media.mediaText !== next) { try { r.media.mediaText = next; } catch (e) {} }
      }
      if (r.cssRules) processRules(r.cssRules, w);
    }
  }
  let scheduled = false;
  function pass() {
    scheduled = false;
    const w = fakeW();
    for (const s of document.styleSheets) { let rules; try { rules = s.cssRules; } catch (e) { continue; } processRules(rules, w); }
  }
  const schedule = () => { if (!scheduled) { scheduled = true; queueMicrotask(pass); } };

  for (const P of [CSSStyleSheet.prototype, window.CSSGroupingRule && CSSGroupingRule.prototype]) {
    if (!P || !P.insertRule) continue;
    const ins = P.insertRule;
    P.insertRule = function () { const i = ins.apply(this, arguments); schedule(); return i; };
  }
  new MutationObserver(schedule).observe(document, { childList: true, subtree: true, characterData: true });
  document.addEventListener('load', schedule, true); // <link rel=stylesheet> chargés
  window.addEventListener('resize', schedule);

  // Mise en page Bureau à 1280px, réduite proportionnellement à la largeur réelle de la fenêtre
  const st = document.createElement('style');
  st.textContent = `html, body { min-width: ${MIN}px !important; }`;
  (document.head || document.documentElement).append(st);
  function applyZoom() {
    const z = Math.max(MIN_ZOOM, Math.min(1, realW() / MIN));
    document.documentElement.style.zoom = z === 1 ? '' : String(z);
  }
  applyZoom();
  window.addEventListener('resize', applyZoom);

  schedule();
})();
