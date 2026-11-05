# Lenancker Launcher

Launcher personnel qui regroupe mes applications d'études. Design glassmorphism
(dégradés animés, cartes translucides), installable sur **Android** (PWA) et
packagé pour **Windows** (.exe via Electron).

Site publié (GitHub Pages) : **https://arthurlenancker-boop.github.io/Lenancker_launcher/**

## Apps

| App | Statut | Description |
| --- | --- | --- |
| `apps/ocr/` — OCR Mistral | disponible | Extrais le texte d'images (PNG/JPG/WEBP/GIF) et de PDF via `POST https://api.mistral.ai/v1/ocr` (modèle `mistral-ocr-latest`). Clé API collée dans l'app, stockée en `localStorage`, envoyée uniquement à `api.mistral.ai`. Résultat en Markdown : aperçu rendu avec **maths KaTeX**, copie Markdown, **copie HTML riche** (coller dans Word/Google Docs) et **export .docx éditable** (titres, listes, tableaux, sub/superscripts, images embarquables via l'option « Inclure les images »), plus téléchargement `.md`. Perf : KaTeX/docx chargés uniquement si besoin (maths, export), plusieurs documents analysés en parallèle (2 requêtes). |
| Pomodoro | bientôt | Sessions de concentration chronométrées. |
| Révision | bientôt | Fiches de révision espacée et quiz actifs (répétition espacée, test actif). |

## Structure

```
├── index.html                  ← accueil du launcher (grille d'apps)
├── manifest.webmanifest        ← PWA (installable Android)
├── sw.js                       ← service worker (fonctionnement hors-ligne)
├── assets/
│   ├── css/design.css          ← design system partagé (tokens, glass, animations)
│   ├── js/apps.js              ← registre des apps (ajouter une app = 1 entrée ici)
│   ├── js/common.js            ← toasts, icônes SVG, enregistrement du SW
│   ├── js/launcher.js          ← rendu de la grille d'accueil
│   ├── fonts/                  ← Inter embarquée (woff2)
│   ├── icons/                  ← icônes PWA (PNG 192/512/maskable, favicon SVG)
│   └── vendor/                 ← marked + DOMPurify embarqués ; KaTeX et docx embarqués (chargés à la demande par l'app OCR)
├── apps/ocr/                   ← app OCR Mistral (index.html, ocr.css, ocr.js)
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
elle est stockée en `localStorage` et n'est transmise qu'à `https://api.mistral.ai`.
