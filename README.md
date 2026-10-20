# MPG / MPP / L1 – Outils

Extension Chrome (MV3) pour mpg.football, mpp.football et ligue1.com.

| Fichier | Rôle |
|---|---|
| `src/desktop.js` | Force la version Bureau (MPG et MPP, breakpoint 1280px) (monde MAIN, `document_start`). Désactivable dans Réglages. |
| `src/custom-user.js` | Entrée « Custom user » du header : apply/reset via une iframe `/debug` cachée, historique, réglages. |
| `src/history.js` | Historique partagé (content script + popup) : `userId - username`, clear all. |
| `src/user-capture.js` | Lit la réponse `GET /user` (monde MAIN) pour récupérer le username du user affiché. |
| `popup/` | Popup du bouton de l'extension (custom user + réglages). |

Stockage (`chrome.storage.local`) : `hist` (prod), `hist_dev` (dev), `settings`.

Historique séparé prod / dev : prod = `mpg.football`, `mpp.football`, `ligue1.com` (ou `www.`) ; tout autre hôte (`dev.…`, `staging.…`, `localhost`) utilise l'historique dev, signalé « Historique (dev) ». La popup suit l'onglet actif.


## MPP

Sur mpp.football, même mécanique (iframe `/debug` cachée) ; le store persistant est la clé localStorage `debug` (au lieu de `mmkv.default\debug` sur MPG) et l'entrée est clonée depuis une entrée inactive du header (`[data-testid="(home)"]`, …). L'historique est partagé entre MPG, MPP et Ligue 1 : le userId est vert s'il a été utilisé sur MPG, bleu sur MPP, orange sur Ligue 1, arc-en-ciel sur plusieurs (champ `sites` de chaque entrée).

Header MPP compacté : « Mes Pronos » → « Pronos », « Mes ligues » → « Ligues », libellé « Menu » masqué (`compactMppHeader` dans `custom-user.js`).


## Ligue 1

Sur ligue1.com, l'iframe cachée charge `/en/debug-mode` (Next.js : on attend l'hydratation React avant de cliquer, les boutons sont des `<button><h5>`). Le store est `mmkv.default\debug` comme sur MPG ; `identifiers.mpgId` sert de userId dans l'historique (pas de capture du username). L'entrée « Custom user » est clonée depuis le menu du header desktop. La version Bureau forcée et `user-capture.js` ne s'appliquent pas à ligue1.com.
