# Lenancker Launcher

Launcher personnel qui regroupe mes applications d'études. Design glassmorphism
(dégradés animés, cartes translucides), installable sur **Android** (PWA) et
packagé pour **Windows** (.exe via Electron).

Site publié (GitHub Pages) : **https://arthurlenancker-boop.github.io/Lenancker_launcher/**

## Apps

| App | Statut | Description |
| --- | --- | --- |
| `apps/ocr/` — OCR Mistral | disponible | Extrais le texte d'images (PNG/JPG/WEBP/GIF/AVIF), de PDF et de documents Office (.docx/.pptx) via `POST https://api.mistral.ai/v1/ocr` (modèle `mistral-ocr-latest`, `table_format` markdown pour des tables bien formées, retente une fois sans lui si le modèle courant ne le connaît pas). Clé API collée dans l'app, stockée en `localStorage` (avec repli), envoyée uniquement à `api.mistral.ai` ; un test réussi l'enregistre tout seul. Résultat en Markdown : aperçu rendu avec **maths KaTeX** (y compris indices/exposants simples `x_1`, `x^2`, code ``` et `inline` protégés, paires `$...$` de devise ignorées), **score de fiabilité OCR** par document en mode OCR (avertissement quand il est bas), **en-têtes/pieds de page écartés** du texte (au choix), copie Markdown, **copie HTML riche** (coller dans Word/Google Docs) et **export .docx éditable** (titres, listes, tableaux, sub/superscripts, images **au rapport largeur/hauteur réel** quand l'API fournit les bbox, via l'option « Inclure les images »), plus téléchargement `.md`. **PDF à texte sélectionnable** : le scan tel quel (JPEG/PNG d'origine) + calque de texte invisible positionné sur les bbox renvoyés par l'API (`include_blocks` ; en mode « Recréé par IA », pas de calque — la feuille seule) ; bouton par scan et **PDF combiné** (une page par feuille, dans l'ordre réordonnable de la file) ; **détourage optionnel des scans** (retire les bords de table autour de la feuille, sans jamais couper un bloc détecté), **redressement automatique des scans penchés** (angle détecté par profil de projection sur les lignes de texte ; l'image redressée est envoyée à l'API et sert de base au PDF exporté — caractères, tableaux et calque texte tombent droits), **réparation des tableaux markdown** (rangées plus courtes que l'en-tête comblées, séparateur réécrit — jamais de contenu supprimé ; tables saines inchangées). Au lancement, deux **modes** : « OCR (fidèle) » — le texte sort tel que reconnu, rien n'est modifié — et « Recréé par IA » — **pas d'appel OCR préalable** pour les images et PDF : un modèle Mistral **à vision** (choisi dans la liste accessible à ta clé : `pixtral-12b-2409`, `mistral-small-latest`…, jusqu'à 3 essais car toutes les clés n'exposent pas les modèles vision) reçoit l'image redressée, ou les pages du PDF rastérisées par pdf.js (chargé à la demande, ~1600 px de côté long, par tranches de 8 pages) et **recrée de zéro le document d'origine en Markdown**. Le prompt, strictement fermé, en fait une copie du fond et rien d'autre : interdiction de répondre au document, d'ajouter, d'inventer, de deviner, de résumer, de traduire ou de corriger (coquilles d'origine conservées) ; chiffres/unités/dates/noms recopiés à l'identique ; mot illisible rendu `[illisible]` ; figures remplacées par un repère `![figure](figure-N)` sans être décrites (légende écrite recopiée) ; maths en LaTeX fidèle, typographie française ; température 0. **Figures remises en place — la chaîne à l'envers** : avec l'option « Inclure les figures » cochée, un appel OCR discret part en parallèle de la reconstruction, moissonne les figures d'origine (base64 + proportions bbox) et les soude à leurs repères **dans l'ordre d'apparition, renumérotées uniques par occurrence** — la numérotation du modèle repart à zéro au-delà de 8 pages (tranches), l'ordre d'apparition, lui, ne trompe pas — aperçu et export `.docx` compris ; moisson ratée → repères texte, jamais bloquant. **PDF du document recréé** (bouton « PDF recréé ») : le texte reconstruit et ses figures composés en pages A4 dans une fenêtre d'impression dédiée (thème clair, `@page` A4, titres/tables/bordures, CSS KaTeX lié en URL absolue, figures en data-URL — rien à attendre du réseau) ; « Enregistrer au format PDF » du dialogue, ou impression papier — pour les documents multi-pages recréés, c'est leur première sortie PDF, le scan garde son propre bouton. **Mise en page positionnelle** : une passe LAYOUT (vision, en parallèle de la reconstruction, tranches de 4 pages) rend chaque page en blocs positionnés (`{t, x, y, w, h, pt, txt}` en fractions de page, figures numérotées par ordre d'apparition — alignées sur les clés de la soudure) ; le compositeur garde les **positions exactes** quand la page tient (`y+h ≤ 1,01`, pas de chevauchement massif), **empile par colonnes** sinon (bandes de x, hauteurs de texte estimées mais jamais imposées — le texte coule en hauteur auto, figures cadrées à leurs **vraies proportions** de bbox, compression ≤ 12 %), et rend la main à la recomposition fluide si la page est irrécupérable — jamais de PDF cassé, jamais de texte rogné. Face au cliché, la reconstruction est **intelligente** : les artefacts du scan n'existent pas (texte penché ou en perspective, table ou fond autour de la feuille, cadrage décentré, ombres — jamais mentionnés) ; ordre de lecture logique du document original ; tableau photographié de travers ou mal cadré refait en Markdown aligné, en-têtes déduits ; césures de fin de ligne recollées ; hiérarchie des titres déduite de la mise en page ; en-têtes/pieds répétitifs omis quand la case est cochée. Les .docx/.pptx, déjà numériques, restent extraits par l'OCR seul (toast l'annonce). **Documents annotés au stylo** : avant la reconstruction, un repérage vision (JSON compact sur les premières pages) établit un inventaire du manuscrit — chaque annotation avec son emplacement (haut de page, marge latérale, entre les lignes, bas de page) — qui servira de filet ; s'il y a du manuscrit, un **dialogue demande le traitement voulu** — séparer (le texte imprimé, puis une section « Annotations manuscrites » groupée par emplacement, avec les lignes du texte concernées), ignorer (texte imprimé seul) ou tout transcrire à sa place (entre « », suivi de `[manuscrit]`) — puis ce choix **mémorisé dans la cascade de stockage** s'applique en silence aux documents suivants (modifiable à tout moment sous le mode d'analyse ; tout échec du repérage dégrade vers la reconstruction classique (tout est recréé, manuscrit compris), jamais une file bloquée). Antidérive en profondeur, fondée sur essais réels : la reconstruction des documents annotés court sur l'ordre des gros modèles (medium puis large — le petit modèle laisse fuir le manuscrit dans « Texte imprimé »), reçoit l'inventaire du repérage dans sa consigne (« recopie ta propre lecture, ne rien omettre, ne rien inventer »), puis une **réconciliation** aligne le résultat sur cet inventaire : lignes manuscrites fugées dans « Texte imprimé » retirées, note repérée absente recopiée sous son emplacement, note mal rangée déplacée, section « Annotations » reconstruite si le modèle l'a oubliée — chaque texte ajouté a été lu sur la page par le repérage, rien n'est inventé. **Résultat unique par document** : le Markdown affiché est la reconstruction (mode IA) ou la reconnaissance (mode fidèle) ; les téléchargements s'appellent `document.md`/`.docx` en mode IA, `document.ocr.md`/`.docx` en mode OCR ; le PDF exporté d'un scan recréé garde la feuille seule, sans calque de texte (la reconstruction ne fournit pas de positions), celui d'un scan OCR garde son calque. Repérage des annotations annulé (dialogue fermé sans choix) : le document passe en échec avec un message explicite — plus de repli silencieux, l'OCR n'a pas tourné. Perf : KaTeX/docx/pdf-lib chargés uniquement si besoin (maths, export), plusieurs documents analysés en parallèle (2 requêtes). |
| `apps/focus/` — Focus | disponible | Sessions de concentration **fondées sur le brief de recherche TDA/H + TSA** (`docs/recherche-focus-tda-tsa.md`). Mode **Flux** par défaut : la pause arrive quand le flow casse (bornes min/max conseillées, jamais imposées — Smits et al. 2024) ; Pomodoro 25/5 en option. Temps **toujours visible** (grand anneau + compte à rebours + titre d'onglet, contre la cécité du temps), **bruit blanc/rose/marron** (WebAudio), **pauses actives guidées**, **body doubling local** (onglets synchronisés via BroadcastChannel), plan **« si… alors… »** anti-distraction, **récompense liée à ton centre d'intérêt** avec minuteur doux, déroulé visuel (visual schedule), stats de consistance (série de jours, minutes, points), **minuteur de récompense au choix** (5/10/15 min), **raccourcis clavier** (Espace : pause/reprendre, D : distraction) et **stockage en cascade** (localStorage → sessionStorage → mémoire, avec cause affichée et re-sonde de guérison si la base du navigateur était temporairement verrouillée) — **tout réglable** (sons, animations réduites, durées) ; l'intention (tâche, plan « si… alors… », récompense) est enregistrée au fil de la frappe, même sans session lancée. |
| `apps/revision/` — Révision | disponible | Cartes mémos fondées sur [le brief répétition espacée & test actif](docs/recherche-revision-memoisation.md) : chaque carte est une question-réponse qu'on **se teste** soi-même (test actif — Roediger & Karpicke 2006), la réponse ne se révèle que sur action (difficultés désirables, Bjork), et SM-2 modifié (variante Anki : Encore ~10 min, Difficile ×1,2, Moyen × facilité, Facile × facilité ×1,3, ease plafonné 1,3-3,5) replanifie la carte **juste avant l'oubli** (intervalles jusqu'à 1 an, cartes « mûres » à 3 semaines). Paquets multiples, création/édition/suppression des cartes, nouvelles plafonnées par session (20), série de jours + 7 derniers jours, raccourcis clavier (Espace : retourner, 1-4 : noter, Échap : terminer), stockage en cascade + export/import fusion sans doublon (la version la plus récemment révisée gagne). Le moteur SM-2 vit dans `core.js`, testable sous Node. **Chaque paquet choisit sa méthode** : SM-2 (par défaut, inchangé) ou **Boîte de Leitner** (boîtes 1-5 aux vrais intervalles — chaque jour, tous les 2 jours, chaque semaine, toutes les 2 semaines, puis acquise) : réussie (« J'ai réussi ») la carte monte d'une boîte (confettis en boîte 5), ratée (« À revoir ») elle retourne en boîte 1 ; session par échéances (le plus en retard d'abord) + 20 nouvelles max, ou en **ciblé** en cliquant une boîte ; progression du paquet en % de cartes acquises, répartition des 5 boîtes, recherche par texte ou « boîte : N », raccourcis Espace : retourner, 1 : à revoir, 2 : réussi, Échap : terminer. **Changement de méthode possible à tout moment** : intervalles SM-2 et boîtes se convertissent au palier correspondant (mûre ↔ boîte 5), la progression gagnée n'est jamais perdue. Le moteur Leitner vit aussi dans `core.js`, testable sous Node. |
| `apps/probabilites/` — Arbre de probabilité | disponible | Dessin **pas à pas** d'un arbre de probabilité pondéré (jusqu'à 4 niveaux), **zéro calcul** : nom de l'expérience, événement + contraire à chaque niveau (laissé vide = barre **dessinée** au-dessus de la lettre, ou accent circonflexe au choix), choix par branche « feuille terminale » ou « développer », probabilités saisies **manuellement** en format libre (« 0,3 », « 3/10 », « 30 % » — jamais analysées ni vérifiées), résultat de chaque chemin dans les cases à droite des feuilles, case optionnelle « Total des issues ». Mise en page automatique type *tidy tree* (parents centrés, feuilles alignées à droite, aucun chevauchement), orientation horizontale ou verticale, feuille blanche style manuel de maths (traits noirs fins, serif, étiquettes de probabilité au milieu des branches au-dessus du trait), exports **PNG haute définition (≈ 300 dpi)**, **SVG** et copie presse-papiers, bouton « Réutiliser comme modèle » (structure et noms conservés, toutes les valeurs saisies vidées). Moteur de mise en page et de dessin SVG dans `core.js`, testable sous Node. |

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
├── apps/revision/              ← app Révision (cartes mémos — SM-2 ou Boîte de Leitner par paquet, core.js testable sous Node)
├── apps/probabilites/          ← app Arbre de probabilité (dessin pas à pas, zéro calcul, core.js testable sous Node)
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
