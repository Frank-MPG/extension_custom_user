(() => {
  // MPP (mpp.football) : même page /debug que MPG, mais store persistant sous la clé `debug` et header sans <a href>
  // Ligue 1 (ligue1.com, Next.js) : page /en/debug-mode, même store que MPG (`mmkv.default\debug`), boutons <button><h5>
  const IS_MPP = /(^|\.)mpp\.football$/.test(location.hostname), IS_L1 = /(^|\.)ligue1\.com$/.test(location.hostname);
  const SITE = IS_MPP ? 'mpp' : IS_L1 ? 'l1' : 'mpg';
  const MAX = 15, ID = 'mpgcu-entry', STORE = IS_MPP ? 'debug' : 'mmkv.default\\debug';
  const DEBUG_PATH = IS_L1 ? '/en/debug-mode' : '/debug';
  const PILL = IS_L1 ? 'a' : 'div'; // enfant direct de l'entrée qui porte le fond « pilule »
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const currentIds = () => { try { return JSON.parse(localStorage.getItem(STORE)).state.data.identifiers || null; } catch { return null; } };
  const currentUserId = () => { const i = currentIds(); return i && (i.mpgId || i.identifier); };
  const currentIdentifier = () => { try { return JSON.parse(localStorage.getItem(STORE)).state.data.identifiers?.identifier; } catch { return undefined; } };

  // ---------- Réglages ----------
  const DEFAULTS = { rainbow: true, banner: true, forceDesktop: true };
  let settings = { ...DEFAULTS };
  chrome.storage.local.get('settings').then(r => { settings = { ...DEFAULTS, ...(r.settings || {}) }; applySettings(); });
  chrome.storage.onChanged.addListener(ch => { if (ch.settings) { settings = { ...DEFAULTS, ...(ch.settings.newValue || {}) }; applySettings(); } });
  const setSetting = (k, v) => chrome.storage.local.set({ settings: { ...settings, [k]: v } });
  function applySettings() {
    // Blocage du layout mobile : desktop.js le lit au chargement, donc on recharge si l'état change (pas sur ligue1.com)
    if (!IS_L1) syncDesktop();
    const el = document.getElementById(ID);
    if (el) el.classList.toggle('mpgcu-active', !!currentIdentifier() && settings.rainbow);
    applyBanner();
    updateLabel();
  }
  function syncDesktop() {
    const want = settings.forceDesktop ? '1' : '0';
    let stored; try { stored = localStorage.getItem('mpgcu_forceDesktop'); } catch {}
    if ((stored || '1') !== want) {
      try { localStorage.setItem('mpgcu_forceDesktop', want); } catch {}
      if (window.top === window) location.reload();
    }
  }
  // Username du custom user actif, lu dans l'historique (complété par resolve() via user-capture.js)
  let curUsername;
  async function refreshUsername() {
    const ids = currentIds();
    let name;
    if (ids && ids.identifier) {
      const h = await MpgHist.get();
      const e = h.find(x => x.identifier === ids.identifier && x.username) || (ids.mpgId && h.find(x => x.userId === ids.mpgId && x.username));
      name = e ? e.username : undefined;
    }
    if (name !== curUsername) { curUsername = name; updateLabel(); }
  }
  chrome.storage.onChanged.addListener(ch => { if (ch.hist || ch.hist_dev) refreshUsername(); });
  refreshUsername();
  // Libellé du bouton : username (sinon userId) du custom user si le bandeau est caché
  function updateLabel() {
    const el = document.getElementById(ID); if (!el) return;
    const leaf = el.querySelector('[data-mpgcu-label]'); if (!leaf) return;
    const uid = currentUserId(), show = uid && !settings.banner;
    const txt = show ? curUsername || uid : 'Custom user';
    if (leaf.textContent !== txt) leaf.textContent = txt;
    leaf.title = show ? 'Connecté avec : ' + uid + (curUsername ? ' - ' + curUsername : '') : '';
  }
  // Bandeau rouge "Connecté avec : <userId>"
  // MPG : <span>Connecté avec : …</span> ; MPP : <div>Connected as: …</div> ; L1 : <h4>Connecté avec: …</h4>. Le parent direct est la barre rouge.
  const BANNER_RE = /^\s*(Connecté avec|Connected (as|with))\s*:/i;
  let bars = [];
  function applyBanner() {
    bars = bars.filter(b => b.isConnected);
    if (!bars.length) {
      for (const el of document.querySelectorAll('span, div, h4')) {
        if (el.children.length || !BANNER_RE.test(el.textContent)) continue;
        if (el.parentElement) bars.push(el.parentElement);
      }
    }
    for (const bar of bars) bar.style.display = settings.banner ? '' : 'none';
  }

  // ---------- Pilote la page /debug dans une iframe cachée (même origine) ----------
  async function viaHiddenDebug(mode, value) {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-99999px;top:0;width:1300px;height:800px;visibility:hidden;pointer-events:none';
    f.src = location.origin + DEBUG_PATH;
    document.documentElement.append(f);
    try {
      const label = mode === 'apply' ? 'Apply custom user' : 'Reset custom user';
      // L1 (Next.js) : le HTML SSR est là avant que React n'attache les handlers → attendre l'hydratation
      const hydrated = el => !IS_L1 || Object.keys(el).some(k => k.startsWith('__reactProps'));
      let doc, input, btn;
      for (let i = 0; i < 75; i++) { // ~15s max
        await sleep(200);
        doc = f.contentDocument; if (!doc) continue;
        input = doc.querySelector('input[placeholder="userId / shortId / email"]');
        btn = [...doc.querySelectorAll('div,button,h5')].find(e => e.children.length === 0 && e.textContent.trim() === label);
        if (IS_L1 && btn) btn = btn.closest('button') || btn;
        if (input && btn && hydrated(input) && hydrated(btn)) break;
      }
      if (!btn) return 'Page ' + DEBUG_PATH + ' : bouton « ' + label + ' » introuvable';
      const w = f.contentWindow;
      if (mode === 'apply') {
        Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new w.Event('input', { bubbles: true }));
        await sleep(200);
      }
      const t = IS_L1 ? btn : btn.parentElement || btn, o = { bubbles: true, cancelable: true, view: w, button: 0 };
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(ty =>
        t.dispatchEvent(ty.startsWith('pointer') ? new w.PointerEvent(ty, { ...o, pointerType: 'mouse', isPrimary: true }) : new w.MouseEvent(ty, o)));
      for (let i = 0; i < 50; i++) { // attend que le store persistant soit mis à jour
        await sleep(200);
        const cur = currentIdentifier();
        if (mode === 'apply' ? cur === value : cur === undefined) return 'ok';
        if (mode === 'apply' && /Invalid user/.test(doc.body.innerText)) return 'Utilisateur invalide : ' + value;
      }
      return 'Pas de confirmation de la page ' + DEBUG_PATH + ' (timeout)';
    } finally { f.remove(); }
  }

  async function run(mode, value) {
    value = (value || '').trim();
    if (mode === 'apply' && !value) return 'Renseigne un userId / shortId / email';
    toast('…');
    document.getElementById(ID)?.classList.add('mpgcu-busy');
    const r = await viaHiddenDebug(mode, value);
    if (r !== 'ok') { document.getElementById(ID)?.classList.remove('mpgcu-busy'); toast(r, true); return r; }
    if (mode === 'apply') { await MpgHist.add(value, SITE); sessionStorage.setItem('mpgcu_applied', String(Date.now())); }
    sessionStorage.setItem('mpgcu_toast', mode === 'apply' ? 'Custom user : ' + value : 'Custom user reset');
    location.reload();
    return 'ok';
  }

  // Message depuis le popup de l'extension
  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (msg && msg.mpgcu) { run(msg.mode, msg.value).then(reply); return true; }
  });

  // ---------- UI ----------
  let host, root, toastEl;
  function toast(t, err) {
    toastEl?.remove();
    const d = toastEl = document.createElement('div');
    d.textContent = t;
    d.style.cssText = `position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#06200f;color:${err ? '#ff6b6b' : '#3ddc84'};padding:8px 14px;border-radius:8px;font:600 13px system-ui;z-index:2147483647;box-shadow:0 4px 16px #0006`;
    document.documentElement.append(d); setTimeout(() => d.remove(), t === '…' ? 20000 : 3000);
  }
  function buildPanel() {
    host = document.createElement('div');
    host.style.cssText = 'position:fixed;z-index:2147483647;display:none';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      .p{width:290px;padding:12px;background:#0f1a14;color:#e8f2ec;border-radius:10px;box-shadow:0 8px 28px #0008;font:13px system-ui,sans-serif}
      input[type=text]{width:100%;box-sizing:border-box;padding:8px;border-radius:6px;border:1px solid #2e4a3a;background:#17261d;color:inherit;outline:none}
      .row{display:flex;gap:6px;margin-top:8px}
      button{flex:1;padding:7px;border:0;border-radius:6px;cursor:pointer;font-weight:600}
      .a{background:#3ddc84;color:#06200f}.r{background:#2e4a3a;color:#e8f2ec}
      .opts{margin-top:8px;padding-top:8px;border-top:1px solid #2e4a3a;display:flex;flex-direction:column;gap:4px}
      .gear{display:flex;justify-content:space-between;align-items:center;width:100%;margin-top:8px;padding:6px 8px;background:transparent;color:#9fbcaa;border:1px solid #2e4a3a;border-radius:6px;cursor:pointer;font:600 12px system-ui,sans-serif}.gear:hover{background:#17261d;color:#e8f2ec}.gear .chev{transition:transform .2s}.gear.open .chev{transform:rotate(180deg)}.opts:not(.open){display:none}.opts{border-top:0!important;padding:8px 2px 0!important;margin-top:0!important}
      .opts label{display:flex;gap:6px;align-items:center;color:#9fbcaa;cursor:pointer}
      .opts input{width:auto;margin:0}
      .hh{display:flex;justify-content:space-between;align-items:center;margin-top:10px;color:#7fa08c;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
      .hh a{cursor:pointer;color:#9fbcaa;text-transform:none;letter-spacing:0;font-size:12px}.hh a:hover{color:#ff8a8a}.hh a.confirm{color:#ff6b6b;font-weight:600}
      ul:empty{display:none}
      .cur{margin-top:8px;color:#9fbcaa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      ul{list-style:none;padding:0;margin:8px 0 0;max-height:220px;overflow:auto}
      li{display:flex;align-items:center;gap:4px;padding:5px 6px;border-radius:5px;cursor:pointer}
      li:hover{background:#17261d}li span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      li b{color:#7fa08c;font-weight:400;padding:0 4px}
      li .pin{display:flex;align-items:center;color:#7fa08c;opacity:0;cursor:pointer;padding:0 2px;transition:opacity .15s,color .15s} li:hover .pin{opacity:.8} li .pin:hover{color:#e8f2ec;opacity:1} li.pinned .pin{opacity:1;color:#3ddc84} li.pinned .pin svg{fill:#3ddc84} li.pinned + li:not(.pinned){border-top:1px solid #2e4a3a;margin-top:4px;padding-top:9px}
    </style>
    <div class="p">
      <input type="text" id="q" placeholder="userId / shortId / email  (Entrée)">
      <div class="row"><button class="a" id="apply">Apply custom user</button><button class="r" id="reset">Reset</button></div>
      <div class="cur" id="cur"></div>
      <div class="hh" id="hh"><span>Historique</span><a id="clear">Clear all</a></div>
      <ul id="hist"></ul>
      <button class="gear" id="gear" type="button"><span>⚙ Réglages</span><span class="chev">▾</span></button>
      <div class="opts">
        <label><input type="checkbox" id="optRainbow"> Effet arc-en-ciel quand actif</label>
        <label><input type="checkbox" id="optBanner"> Bandeau rouge « Connecté avec »</label>
        <label><input type="checkbox" id="optDesktop"> Toujours la version Bureau (recharge)</label>
      </div>
    </div>`;
    const $ = id => root.getElementById(id);
    $('optRainbow').onchange = e => setSetting('rainbow', e.target.checked);
    $('optBanner').onchange = e => setSetting('banner', e.target.checked);
    $('optDesktop').onchange = e => setSetting('forceDesktop', e.target.checked);
    (() => { const g = root.getElementById('gear'), o = root.querySelector('.opts');
  let open = false; try { open = localStorage.getItem('mpgcu_gear') === '1'; } catch {}
  const set = v => { open = v; g.classList.toggle('open', v); o.classList.toggle('open', v); try { localStorage.setItem('mpgcu_gear', v ? '1' : '0'); } catch {} };
  set(open); g.onclick = () => set(!open); })();
    $('apply').onclick = () => { hide(); run('apply', $('q').value); };
    $('reset').onclick = () => { hide(); run('reset'); };
    $('q').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { hide(); run('apply', $('q').value); } if (e.key === 'Escape') hide(); });
    host.addEventListener('mousedown', e => e.stopPropagation());
    document.addEventListener('mousedown', hide);
    document.documentElement.append(host);
  }
  async function renderPanel() {
    root.getElementById('optRainbow').checked = settings.rainbow;
    root.getElementById('optBanner').checked = settings.banner;
    root.getElementById('optDesktop').checked = settings.forceDesktop;
    const cur = currentIdentifier();
    root.getElementById('cur').textContent = cur ? 'Actif : ' + cur : 'Aucun custom user actif';
    await MpgHist.render(root.getElementById('hist'), root.getElementById('clear'), root.getElementById('hh'), {
      onApply: id => { hide(); run('apply', id); },
      onChange: renderPanel,
    });
  }
  function hide() { if (host) host.style.display = 'none'; document.getElementById(ID)?.classList.remove('mpgcu-on'); }
  async function toggle(anchor) {
    if (!host) buildPanel();
    if (host.style.display === 'block') return hide();
    const r = anchor.getBoundingClientRect();
    host.style.top = (r.bottom + 6) + 'px';
    host.style.left = Math.max(8, Math.min(r.left, innerWidth - 300)) + 'px';
    host.style.display = 'block';
    anchor.classList.add('mpgcu-on');
    await renderPanel();
    root.getElementById('q').focus();
  }

  // ---------- Entrée dans le header ----------
  function injectStyle() {
    if (document.getElementById('mpgcu-style')) return;
    const st = document.createElement('style'); st.id = 'mpgcu-style';
    st.textContent = `
      #${ID} .mpgcu-icn *{transform-box:fill-box;transform-origin:center}
      #${ID} .mpgcu-frame{transition:fill .25s ease}
      #${ID}.mpgcu-on > ${PILL}{background:rgba(255,255,255,.22);border-color:rgba(255,255,255,.35)}
      #${ID}.mpgcu-on .mpgcu-frame{fill:#4a55e0;animation:mpgcu-frame .5s cubic-bezier(.3,1.6,.5,1)}
      #${ID}.mpgcu-on .mpgcu-person{animation:mpgcu-person .55s cubic-bezier(.3,1.6,.5,1) .05s}
      #${ID}.mpgcu-on .mpgcu-dot{animation:mpgcu-dot .5s ease .15s}
      #${ID}.mpgcu-busy .mpgcu-person{animation:mpgcu-busy .9s ease-in-out infinite}
      @keyframes mpgcu-frame{0%{transform:scale(1)}30%{transform:scale(.8) rotate(-6deg)}65%{transform:scale(1.08) rotate(3deg)}100%{transform:scale(1) rotate(0)}}
      @keyframes mpgcu-person{0%{transform:translateY(0)}30%{transform:translateY(2.5px) scale(.9)}65%{transform:translateY(-2px) scale(1.08)}100%{transform:translateY(0) scale(1)}}
      @keyframes mpgcu-dot{0%,100%{transform:scale(1)}50%{transform:scale(1.4)}}
      @keyframes mpgcu-busy{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
      #${ID}.mpgcu-active > ${PILL}{position:relative;background:linear-gradient(90deg,#ff004c33,#ff8a0033,#ffe60033,#2bff8833,#00c2ff33,#7a5cff33,#ff00c833,#ff004c33) 0 0/300px 100% repeat-x;animation:mpgcu-rainbow 2.5s linear infinite}
      #${ID}.mpgcu-active > ${PILL}::before{content:'';position:absolute;inset:-1px;border-radius:inherit;padding:2px;background:linear-gradient(90deg,#ff004c,#ff8a00,#ffe600,#2bff88,#00c2ff,#7a5cff,#ff00c8,#ff004c) 0 0/300px 100% repeat-x;animation:mpgcu-rainbow 2.5s linear infinite;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}
      @keyframes mpgcu-rainbow{to{background-position:300px 0}}
      @media (prefers-reduced-motion: reduce){#${ID} *{animation:none!important}}` +
      // MPP : l'entrée n'a pas de fond « pilule » → on en crée une sans décaler la mise en page
      (IS_MPP ? `
      #${ID} > div{margin:-6px -9px;padding:5px 8px;border-radius:10px;border:1px solid transparent;transition:background .2s}
      #${ID}:hover > div{background:rgba(255,255,255,.08)}
      #${ID}.mpgcu-on > div{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.25)}` : '') +
      // L1 : idem sur le <a> cloné du menu
      (IS_L1 ? `
      #${ID} > a{margin:0 -10px 0 -4px;padding:0 10px 0 4px;border-radius:10px;border:1px solid transparent;transition:background .2s}
      #${ID}:hover > a{background:rgba(255,255,255,.08)}
      #${ID}.mpgcu-on > a{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.25)}` : '');
    (document.head || document.documentElement).append(st);
  }
  // MPP : les entrées du header sont des <div data-testid="(home)|(results)|…"> (React Native Web).
  // On clone une entrée inactive (couleur de texte majoritaire) et on remplace son icône SVG.
  function injectMpp() {
    const items = ['(home)', '(results)', '(rankings)', '(leagues)', '(profile)']
      .map(t => document.querySelector(`[data-testid="${t}"]`)).filter(e => e && e.parentElement);
    if (!items.length) return;
    const leafOf = e => [...e.querySelectorAll('*')].find(x => x.children.length === 0 && x.textContent.trim());
    const look = e => { const l = leafOf(e); if (!l) return ''; const cs = getComputedStyle(l); return cs.color + '|' + cs.fontWeight; };
    const counts = {}; items.forEach(i => { const k = look(i); counts[k] = (counts[k] || 0) + 1; });
    const best = Math.max(...Object.values(counts));
    const withSvg = items.filter(i => i.querySelector('svg'));
    const ref = withSvg.find(i => counts[look(i)] === best) || withSvg[0];
    if (!ref) return;
    const el = ref.cloneNode(true);
    el.id = ID; el.removeAttribute('data-testid'); el.removeAttribute('aria-label'); el.style.cursor = 'pointer';
    const leaf = leafOf(el);
    if (leaf) {
      leaf.dataset.mpgcuLabel = '1';
      leaf.style.cssText += ';max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    }
    const active = !!currentIdentifier();
    if (active) { el.title = 'Custom user actif : ' + currentIdentifier(); if (settings.rainbow) el.classList.add('mpgcu-active'); }
    injectStyle();
    const refSvg = ref.querySelector('svg'), oldSvg = el.querySelector('svg');
    const r = refSvg.getBoundingClientRect(), c = leafOf(ref) ? getComputedStyle(leafOf(ref)).color : '#fff';
    const w = Math.round(r.width) || 20, h = Math.round(r.height) || 20;
    const tmp = document.createElement('div');
    tmp.innerHTML =
      `<svg class="mpgcu-icn" width="${w}" height="${h}" viewBox="4 4 24 24" fill="none" style="display:block;overflow:visible;flex-shrink:0">` +
      `<rect class="mpgcu-frame" x="6.8" y="6.8" width="18.4" height="18.4" rx="5.6" stroke="${c}" stroke-width="2.4"/>` +
      `<g class="mpgcu-person" stroke="${c}" stroke-width="2.2" stroke-linecap="round">` +
      '<circle cx="16" cy="13.7" r="2.8"/><path d="M11.4 21.3c.9-2.2 2.6-3.3 4.6-3.3s3.7 1.1 4.6 3.3"/></g>' +
      (active ? '<circle class="mpgcu-dot" cx="24.6" cy="7.4" r="3.6" fill="#E8394D" stroke="#fff" stroke-width="1.6"/>' : '') +
      '</svg>';
    const svg = tmp.firstElementChild;
    const ocs = getComputedStyle(refSvg);
    svg.style.marginRight = ocs.marginRight; svg.style.marginLeft = ocs.marginLeft;
    oldSvg.replaceWith(svg);
    el.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); toggle(el); });
    el.addEventListener('mousedown', e => e.stopPropagation());
    ref.parentElement.append(el);
    updateLabel();
  }

  // MPP : header trop chargé → libellés raccourcis et « Menu » masqué (ré-appliqué à chaque re-render)
  const MPP_RENAME = { '(home)': ['Mes Pronos', 'Pronos'], '(leagues)': ['Mes ligues', 'Ligues'] };
  function compactMppHeader() {
    const home = document.querySelector('[data-testid="(home)"]');
    if (!home) return;
    for (const [tid, [from, to]] of Object.entries(MPP_RENAME)) {
      const item = document.querySelector(`[data-testid="${tid}"]`); if (!item) continue;
      for (const el of item.querySelectorAll('*')) {
        const t = el.firstChild;
        if (el.children.length === 0 && t && t.nodeType === 3 && t.data.trim() === from) t.data = to;
      }
    }
    // « Menu » : feuille texte à côté des icônes burger/chevron, dans le même bloc que la nav
    const header = home.parentElement && home.parentElement.parentElement; if (!header) return;
    for (const el of header.querySelectorAll('div')) {
      if (el.children.length === 0 && el.textContent.trim() === 'Menu' && el.style.display !== 'none') el.style.display = 'none';
    }
  }

  // L1 : menu du header desktop = <div><a href="/en/…"><div class="w_20px">(puce si actif)</div><span>Libellé</span></a></div>.
  // On clone une entrée inactive (emplacement de puce vide), on y met l'icône et on l'ajoute en fin de menu.
  function injectL1() {
    const cal = document.querySelector('.show_desktop header nav a[href$="/calendar"]');
    const list = cal && cal.parentElement && cal.parentElement.parentElement;
    if (!list) return;
    const items = [...list.children].filter(c => c.firstElementChild && c.firstElementChild.tagName === 'A');
    const ref = items.find(c => !c.querySelector('a > div svg')) || cal.parentElement;
    const el = ref.cloneNode(true), a = el.querySelector('a');
    el.id = ID;
    a.removeAttribute('href'); a.setAttribute('role', 'button'); a.tabIndex = 0; a.style.cursor = 'pointer';
    const leaf = [...a.querySelectorAll('*')].find(x => x.children.length === 0 && x.textContent.trim());
    if (leaf) {
      leaf.dataset.mpgcuLabel = '1';
      leaf.style.cssText += ';max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    }
    const active = !!currentIdentifier();
    if (active) { el.title = 'Custom user actif : ' + currentIdentifier(); if (settings.rainbow) el.classList.add('mpgcu-active'); }
    injectStyle();
    const c = leaf ? getComputedStyle(leaf).color : '#fff';
    const slot = a.firstElementChild && a.firstElementChild !== leaf ? a.firstElementChild : null;
    const svg =
      '<svg class="mpgcu-icn" width="20" height="20" viewBox="4 4 24 24" fill="none" style="display:block;overflow:visible">' +
      `<rect class="mpgcu-frame" x="6.8" y="6.8" width="18.4" height="18.4" rx="5.6" stroke="${c}" stroke-width="2.4"/>` +
      `<g class="mpgcu-person" stroke="${c}" stroke-width="2.2" stroke-linecap="round">` +
      '<circle cx="16" cy="13.7" r="2.8"/><path d="M11.4 21.3c.9-2.2 2.6-3.3 4.6-3.3s3.7 1.1 4.6 3.3"/></g>' +
      (active ? '<circle class="mpgcu-dot" cx="24.6" cy="7.4" r="3.6" fill="#E8394D" stroke="#fff" stroke-width="1.6"/>' : '') +
      '</svg>';
    if (slot) { slot.innerHTML = svg; slot.style.marginRight = '6px'; }
    const open = e => { e.preventDefault(); e.stopPropagation(); toggle(el); };
    a.addEventListener('click', open);
    a.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') open(e); });
    el.addEventListener('mousedown', e => e.stopPropagation());
    list.append(el);
    updateLabel();
  }

  function inject() {
    if (IS_MPP) compactMppHeader();
    if (document.getElementById(ID)) return;
    if (IS_MPP) return injectMpp();
    if (IS_L1) return injectL1();
    const ref = document.querySelector('a[href="/newsfeed"]') || document.querySelector('a[href="/profile"]');
    if (!ref || !ref.parentElement) return;
    const el = ref.cloneNode(true);
    el.id = ID; el.removeAttribute('href'); el.style.cursor = 'pointer';
    const leaf = [...el.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent.trim());
    if (leaf) {
      leaf.dataset.mpgcuLabel = '1';
      leaf.style.cssText += ';max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    }
    const active = !!currentIdentifier();
    if (active) { el.title = 'Custom user actif : ' + currentIdentifier(); if (settings.rainbow) el.classList.add('mpgcu-active'); }
    injectStyle();
    const iconSlot = el.firstElementChild && el.firstElementChild.firstElementChild;
    if (iconSlot && iconSlot !== leaf) iconSlot.innerHTML =
      '<svg class="mpgcu-icn" width="32" height="32" viewBox="0 0 32 32" fill="none" style="display:block;overflow:visible">' +
      '<rect class="mpgcu-frame" x="6.8" y="6.8" width="18.4" height="18.4" rx="5.6" stroke="#fff" stroke-width="2.4"/>' +
      '<g class="mpgcu-person" stroke="#fff" stroke-width="2.2" stroke-linecap="round">' +
      '<circle cx="16" cy="13.7" r="2.8"/><path d="M11.4 21.3c.9-2.2 2.6-3.3 4.6-3.3s3.7 1.1 4.6 3.3"/></g>' +
      (active ? '<circle class="mpgcu-dot" cx="24.6" cy="7.4" r="3.6" fill="#E8394D" stroke="#fff" stroke-width="1.6"/>' : '') +
      '</svg>';
    injectStyle();
    el.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); toggle(el); });
    el.addEventListener('mousedown', e => e.stopPropagation());
    ref.parentElement.append(el);
    updateLabel();
  }

  if (window.top !== window) return; // pas dans l'iframe cachée
  let raf = 0;
  new MutationObserver(() => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; inject(); if (!settings.banner) applyBanner(); }); })
    .observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  inject();
  // Complète l'historique avec userId + username du user affiché (capturé par user-capture.js)
  (async () => {
    const ids = currentIds(); if (!ids || !ids.identifier) return;
    const appliedTs = +sessionStorage.getItem('mpgcu_applied') || 0;
    sessionStorage.removeItem('mpgcu_applied');
    for (let i = 0; !IS_L1 && i < 40; i++) { // L1 : pas de capture du username (mpgId fourni par le store)
      let v; try { v = JSON.parse(localStorage.getItem('mpgcu_viewedUser')); } catch {}
      if (v && (v.id === ids.mpgId || (appliedTs && v.ts > appliedTs))) { await MpgHist.resolve(ids.identifier, ids.mpgId || v.id, v.username, SITE); return; }
      await sleep(500);
    }
    await MpgHist.resolve(ids.identifier, ids.mpgId, undefined, SITE); // au moins le userId
  })();

  const pending = sessionStorage.getItem('mpgcu_toast');
  if (pending) { sessionStorage.removeItem('mpgcu_toast'); setTimeout(() => toast(pending), 800); }
})();
