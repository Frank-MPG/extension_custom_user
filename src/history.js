// Historique des custom users — partagé entre le content script et le popup.
// Entrée : { identifier, userId?, username?, pinned?, sites? }  (identifier = ce qui a été saisi : userId, shortId ou email)
// sites : sous-ensemble de ['l1', 'mpg', 'mpp'] = où le custom user a été utilisé → couleur du userId (vert / bleu / orange / arc-en-ciel si plusieurs)
// Les entrées épinglées restent en tête, ne comptent pas dans la limite et survivent au « Clear all ».
// Un historique par environnement : prod (clé `hist`) et dev (clé `hist_dev`).
// prod = domaine nu ou www. (mpg.football, mpp.football, ligue1.com) ; tout le reste (dev., staging., localhost…) = dev.
const MpgHist = (() => {
  const MAX = 15, PROD = ['mpg.football', 'mpp.football', 'ligue1.com'];
  const envOf = hostname => (PROD.includes(String(hostname).replace(/^www\./, '')) ? 'prod' : 'dev');
  // Content script : env de la page. Popup : fixé par setEnv() d'après l'onglet actif (prod par défaut).
  let env = location.protocol === 'chrome-extension:' ? 'prod' : envOf(location.hostname);
  const key = () => (env === 'dev' ? 'hist_dev' : 'hist');
  const norm = e => (typeof e === 'string' ? { identifier: e } : e); // migration depuis l'ancien format (chaînes)
  const get = async () => { const k = key(); return ((await chrome.storage.local.get(k))[k] || []).map(norm); };
  const save = h => {
    const pinned = h.filter(e => e.pinned), rest = h.filter(e => !e.pinned).slice(0, MAX);
    return chrome.storage.local.set({ [key()]: [...pinned, ...rest] });
  };
  const label = e => (e.userId || e.identifier) + (e.username ? ' - ' + e.username : '');
  const withSite = (sites, site) => (site && !(sites || []).includes(site) ? [...(sites || []), site].sort() : sites);
  const mergeSites = (a, b) => { const m = [...new Set([...(a || []), ...(b || [])])].sort(); return m.length ? m : undefined; };

  // Couleur du userId selon le(s) site(s) d'utilisation — injecté dans le document / shadow root du rendu
  const CSS = `
    .mpgcu-uid.mpg{color:#3ddc84}
    .mpgcu-uid.mpp{color:#4ea1ff}
    .mpgcu-uid.l1{color:#ffa94d}
    .mpgcu-uid.both{background:linear-gradient(90deg,#ff004c,#ff8a00,#ffe600,#2bff88,#00c2ff,#7a5cff,#ff00c8,#ff004c) 0 0/200px 100% repeat-x;-webkit-background-clip:text;background-clip:text;color:transparent;animation:mpgcu-uid-rb 3s linear infinite}
    @keyframes mpgcu-uid-rb{to{background-position:200px 0}}
    @media (prefers-reduced-motion: reduce){.mpgcu-uid.both{animation:none}}`;
  const ensureCss = node => {
    const root = node.getRootNode();
    const host = root.head || root; // Document → <head>, ShadowRoot → lui-même
    if (!host.querySelector || host.querySelector('style[data-mpgcu-hist]')) return;
    const st = document.createElement('style'); st.dataset.mpgcuHist = '1'; st.textContent = CSS; host.append(st);
  };
  const siteClass = e => { const s = e.sites || []; return s.length > 1 ? 'both' : s[0] || ''; };
  const SITE_NAMES = { mpg: 'MPG', mpp: 'MPP', l1: 'Ligue 1' };
  const siteTitle = e => {
    const n = (e.sites || []).map(s => SITE_NAMES[s] || s);
    return n.length ? 'Utilisé sur ' + (n.length > 1 ? n.slice(0, -1).join(', ') + ' et ' + n[n.length - 1] : n[0]) : '';
  };

  const PIN_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>';

  const api = {
    get, label, envOf,
    get env() { return env; },
    setEnv(e) { env = e === 'dev' ? 'dev' : 'prod'; },
    async add(identifier, site) {
      const h = await get();
      const prev = h.find(e => e.identifier === identifier || e.userId === identifier);
      const rest = h.filter(e => e !== prev);
      const entry = { ...(prev || {}), identifier };
      const sites = withSite(entry.sites, site); if (sites) entry.sites = sites;
      await save(entry.pinned ? h.map(e => (e === prev ? entry : e)) : [entry, ...rest]);
    },
    // Complète l'entrée avec le userId et le username du user affiché, et dédoublonne par userId
    async resolve(identifier, userId, username, site) {
      const h = await get();
      const i = h.findIndex(e => e.identifier === identifier);
      if (i < 0) return false;
      const dup = h.find((x, j) => j !== i && x.userId && x.userId === userId);
      const sites = withSite(mergeSites(h[i].sites, dup && dup.sites), site);
      const e = { ...h[i], userId, ...(!h[i].username && dup && dup.username ? { username: dup.username } : {}), ...(username ? { username } : {}), ...(dup && dup.pinned ? { pinned: true } : {}), ...(sites ? { sites } : {}) };
      h[i] = e;
      await save(h.filter((x, j) => j === i || !(x.userId && x.userId === userId)));
      return true;
    },
    async togglePin(identifier) {
      await save((await get()).map(e => (e.identifier === identifier ? { ...e, pinned: !e.pinned } : e)));
    },
    async remove(identifier) { await save((await get()).filter(e => e.identifier !== identifier)); },
    async clear() { await save((await get()).filter(e => e.pinned)); },

    // Rendu commun (panneau du header + popup). onApply(identifier), onChange() pour re-rendre.
    async render(ul, clearBtn, header, { onApply, onChange }) {
      const h = await get();
      ensureCss(ul);
      ul.innerHTML = '';
      header.style.display = h.length ? '' : 'none';
      const title = header.querySelector('span'); if (title) title.textContent = 'Historique' + (env === 'dev' ? ' (dev)' : '');
      const hasUnpinned = h.some(e => !e.pinned);
      clearBtn.style.visibility = hasUnpinned ? '' : 'hidden';
      clearBtn.textContent = 'Clear all'; clearBtn.classList.remove('confirm');
      clearBtn.onclick = async () => {
        if (!clearBtn.classList.contains('confirm')) {
          clearBtn.classList.add('confirm'); clearBtn.textContent = 'Confirmer ?';
          setTimeout(() => { clearBtn.classList.remove('confirm'); clearBtn.textContent = 'Clear all'; }, 3000);
          return;
        }
        await api.clear(); onChange();
      };
      h.forEach(e => {
        const li = document.createElement('li');
        if (e.pinned) li.className = 'pinned';
        const sp = document.createElement('span');
        const uid = document.createElement('span');
        uid.className = 'mpgcu-uid ' + siteClass(e);
        uid.textContent = e.userId || e.identifier;
        sp.append(uid, e.username ? ' - ' + e.username : '');
        sp.title = e.identifier + (siteClass(e) ? ' — ' + siteTitle(e) : '');
        sp.onclick = () => onApply(e.identifier);
        const pin = document.createElement('i');
        pin.className = 'pin'; pin.innerHTML = PIN_SVG;
        pin.title = e.pinned ? 'Désépingler' : 'Épingler (gardé au « Clear all »)';
        pin.onclick = async ev => { ev.stopPropagation(); await api.togglePin(e.identifier); onChange(); };
        const x = document.createElement('b');
        x.textContent = '×'; x.title = 'Retirer';
        x.onclick = async ev => { ev.stopPropagation(); await api.remove(e.identifier); onChange(); };
        li.append(sp, pin, x); ul.append(li);
      });
    },
  };
  return api;
})();
