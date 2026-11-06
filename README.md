# Lenancker Launcher

Launcher personnel qui regroupe mes applications d'études. Design glassmorphism
(dégradés animés, cartes translucides), installable sur **Android** (PWA) et
packagé pour **Windows** (.exe via Electron).

Site publié (GitHub Pages) : **https://arthurlenancker-boop.github.io/Lenancker_launcher/**

## Apps

| App | Statut | Description |
| --- | --- | --- |
| `apps/ocr/` — OCR Mistral | disponible | Extrais le texte d'images (PNG/JPG/WEBP/GIF/AVIF), de PDF et de documents Office (.docx/.pptx) via `POST https://api.mistral.ai/v1/ocr` (modèle `mistral-ocr-latest`, `table_format` markdown pour des tables bien formées, retente une fois sans lui si le modèle courant ne le connaît pas). Clé API collée dans l'app, stockée en `localStorage` (avec repli), envoyée uniquement à `api.mistral.ai` ; un test réussi l'enregistre tout seul. Résultat en Markdown : aperçu rendu avec **maths KaTeX** (y compris indices/exposants simples `x_1`, `x^2`, code ``` et `inline` protégés, paires `$...$` de devise ignorées), **score de fiabilité OCR** par document (avertissement quand il est bas), **en-têtes/pieds de page écartés** du texte (au choix), copie Markdown, **copie HTML riche** (coller dans Word/Google Docs) et **export .docx éditable** (titres, listes, tableaux, sub/superscripts, images **au rapport largeur/hauteur réel** quand l'API fournit les bbox, via l'option « Inclure les images »), plus téléchargement `.md`. **PDF à texte sélectionnable** : le scan tel quel (JPEG/PNG d'origine) + calque de texte invisible positionné sur les bbox renvoyés par l'API (`include_blocks`) ; bouton par scan et **PDF combiné** (une page par feuille, dans l'ordre réordonnable de la file) ; **détourage optionnel des scans** (retire les bords de table autour de la feuille, sans jamais couper un bloc détecté), **redressement automatique des scans penchés** (angle détecté par profil de projection sur les lignes de texte ; l'image redressée est envoyée à l'API et sert de base au PDF exporté — caractères, tableaux et calque texte tombent droits), **réparation des tableaux markdown** (rangées plus courtes que l'en-tête comblées, séparateur réécrit — jamais de contenu supprimé ; tables saines inchangées). Au lancement, deux **modes** : « OCR (fidèle) » — le texte sort tel que reconnu, rien n'est modifié — et « OCR assisté par IA » — après la reconnaissance, un modèle Mistral **à vision** (choisi dans la liste accessible à ta clé : `pixtral-12b-2409`, `mistral-small-latest`…, jusqu'à 3 essais car toutes les clés n'exposent pas les modèles vision) **relit le document original** — l'image déjà redressée/détourée, ou les pages du PDF rastérisées par pdf.js (chargé à la demande, ~1600 px de côté long, par tranches de 8 pages) — et **recrée lui-même le document en Markdown** à partir de ce qu'il voit. Le prompt, strictement fermé, en fait une copie et rien d'autre : interdiction de répondre au document, d'ajouter, d'inventer, de deviner, de résumer, de traduire ou de corriger ; chiffres/unités/dates/noms recopiés à l'identique ; mot illisible rendu `[illisible]` ; figures remplacées par un repère `![figure](figure-N)` sans être décrites ; maths en LaTeX fidèle, typographie française ; température 0. Garde programmatique : une retranscription trop écartée en volume de l'OCR (résumé ou dérive) est écartée. L'onglet « Retranscription IA » s'ouvre avec l'OCR brut conservé en « Markdown », et les copies/exports suivent l'onglet actif (`.ia.md` / `.ia.docx`). Perf : KaTeX/docx/pdf-lib chargés uniquement si besoin (maths, export), plusieurs documents analysés en parallèle (2 requêtes). |
| `apps/focus/` — Focus | disponible | Sessions de concentration **fondées sur le brief de recherche TDA/H + TSA** (`docs/recherche-focus-tda-tsa.md`). Mode **Flux** par défaut : la pause arrive quand le flow casse (bornes min/max conseillées, jamais imposées — Smits et al. 2024) ; Pomodoro 25/5 en option. Temps **toujours visible** (grand anneau + compte à rebours + titre d'onglet, contre la cécité du temps), **bruit blanc/rose/marron** (WebAudio), **pauses actives guidées**, **body doubling local** (onglets synchronisés via BroadcastChannel), plan **« si… alors… »** anti-distraction, **récompense liée à ton centre d'intérêt** avec minuteur doux, déroulé visuel (visual schedule), stats de consistance (série de jours, minutes, points), **minuteur de récompense au choix** (5/10/15 min), **raccourcis clavier** (Espace : pause/reprendre, D : distraction) et **stockage en cascade** (localStorage → sessionStorage → mémoire, avec cause affichée et re-sonde de guérison si la base du navigateur était temporairement verrouillée) — **tout réglable** (sons, animations réduites, durées) ; l'intention (tâche, plan « si… alors… », récompense) est enregistrée au fil de la frappe, même sans session lancée. |
| `apps/revision/` — Révision | disponible | Cartes mémos fondées sur [le brief répétition espacée & test actif](docs/recherche-revision-memoisation.md) : chaque carte est une question-réponse qu'on **se teste** soi-même (test actif — Roediger & Karpicke 2006), la réponse ne se révèle que sur action (difficultés désirables, Bjork), et SM-2 modifié (variante Anki : Encore ~10 min, Difficile ×1,2, Moyen × facilité, Facile × facilité ×1,3, ease plafonné 1,3-3,5) replanifie la carte **juste avant l'oubli** (intervalles jusqu'à 1 an, cartes « mûres » à 3 semaines). Paquets multiples, création/édition/suppression des cartes, nouvelles plafonnées par session (20), série de jours + 7 derniers jours, raccourcis clavier (Espace : retourner, 1-4 : noter, Échap : terminer), stockage en cascade + export/import fusion sans doublon (la version la plus récemment révisée gagne). Le moteur SM-2 vit dans `core.js`, testable sous Node. |

## Structure

```
├── index.html                  ← accueil du launcher (grille d'apps)
├── manifest.webmanifest        ← PWA (installable Android)
├── sw.js                       ← service worker (hors-ligne ; pré-cache tolérant : un asset raté ne casse pas le reste)
├── assets/
│   ├── css/design.css          ← design system partagé (tokens, glass, animations)
│   ├── js/apps.js              ← registre des apps (ajouter une app = 1 entrée ici)
│   ├── js/common.js            ← toasts (avec action optionnelle), icônes SVG, enregistrement du SW, toast « mise à jour prête »
│   ├── js/launcher.js          ← rendu de la grille d'accueil
│   ├── fonts/                  ← Inter embarquée (woff2)
│   ├── icons/                  ← icônes PWA (PNG 192/512/maskable, favicon SVG)
│   └── vendor/                 ← marked + DOMPurify embarqués ; KaTeX, docx, pdf-lib embarqués (chargés à la demande par l'app OCR)
├── apps/ocr/                   ← app OCR Mistral (index.html, ocr.css, ocr.js)
├── apps/focus/                 ← app Focus (flux auto-régulé, bruit, stats, core.js testable sous Node)
├── apps/revision/              ← app Révision (cartes mémos SM-2, test actif, core.js testable sous Node)
├── docs/                       ← briefs de recherche (Focus/OCR) déployés avec le site
├── electron/                   ← wrapper Windows : main.js + package.json (electron-builder)
└── .github/workflows/deploy.yml ← déploiement GitHub Pages sur push (main)
```

## Ajouter une app

1. Créer `apps/<slug>/index.html` (+ CSS/JS dédiés), en réutilisant
   `assets/css/design.css` et `assets/js/common.js`.
2. L'ajouter dans `assets/js/apps.js` (`status: 'disponible'`, `href: 'apps/<slug>/'`).
3. Ajouter les nouveaux fichiers dans `CORE` (dans `sw.js`) pour le cache hors-ligne.

## Développement local

```bash
# Servir le site en local (exemples)
python -m http.server 8000
# puis ouvrir http://localhost:8000/
```

Aucun build : site 100 % statique (HTML/CSS/JS vanilla).

## Packaging Windows (.exe)

```bash
cd electron
npm install
npm run dist:win            # installateur NSIS + version portable dans ../dist/
```

> Note Windows : electron-builder télécharge `winCodeSign` (rcedit/signtool) et
> l'extrait avec des liens symboliques, ce qui exige le **Mode Développeur**
> (Paramètres > Confidentialité et sécurité > Pour les développeurs). Sans ce
> mode, pré-extraire `winCodeSign-2.6.0.7z` (hors dossier `darwin`) dans
> `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0\`.
> Résultat du build : `dist/Lenancker Launcher Setup 1.0.0.exe` (NSIS) et
> `dist/Lenancker Launcher 1.0.0.exe` (portable).

## Déploiement (GitHub Pages)

À chaque push sur `main`, le workflow `.github/workflows/deploy.yml` publie le
site sur GitHub Pages (source « GitHub Actions »). URL :
https://arthurlenancker-boop.github.io/Lenancker_launcher/

## Confidentialité

La clé API Mistral de l'app OCR ne quitte jamais le navigateur de l'utilisateur :
elle est stockée en `localStorage` et n'est transmise qu'à `https://api.mistral.ai`
(OCR ; le bouton « Nettoyer » envoie en outre le texte extrait à un modèle de chat
Mistral, avec interdiction d'y ajouter la moindre information).
