const $ = id => document.getElementById(id);
async function render() {
  await MpgHist.render($('hist'), $('clear'), $('hh'), { onApply: id => run('apply', id), onChange: render });
}
async function run(mode, value) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    chrome.tabs.sendMessage(tab.id, { mpgcu: true, mode, value: value || '' });
    window.close();
  } catch { $('msg').textContent = 'Ouvre un onglet MPG, MPP ou Ligue 1 d\'abord'; }
}
$('apply').onclick = () => run('apply', $('q').value);
$('reset').onclick = () => run('reset');
$('q').addEventListener('keydown', e => { if (e.key === 'Enter') run('apply', $('q').value); });
// Historique de l'environnement de l'onglet actif (prod / dev)
chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  try { MpgHist.setEnv(MpgHist.envOf(new URL(tab.url).hostname)); } catch {}
}).finally(render);

(async () => {
  const DEFAULTS = { rainbow: true, banner: true, forceDesktop: true };
  const cur = { ...DEFAULTS, ...((await chrome.storage.local.get('settings')).settings || {}) };
  for (const [id, k] of [['optRainbow', 'rainbow'], ['optBanner', 'banner'], ['optDesktop', 'forceDesktop']]) {
    $(id).checked = cur[k];
    $(id).onchange = async e => {
      const s = { ...DEFAULTS, ...((await chrome.storage.local.get('settings')).settings || {}), [k]: e.target.checked };
      chrome.storage.local.set({ settings: s });
    };
  }
})();

(() => { const g = document.getElementById('gear'), o = document.querySelector('.opts');
  let open = false; try { open = localStorage.getItem('mpgcu_gear') === '1'; } catch {}
  const set = v => { open = v; g.classList.toggle('open', v); o.classList.toggle('open', v); try { localStorage.setItem('mpgcu_gear', v ? '1' : '0'); } catch {} };
  set(open); g.onclick = () => set(!open); })();
