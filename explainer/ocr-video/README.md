# Explainer video — Le modèle OCR local (53 s)

Vidéo animée narrée (français, voix edge-tts) qui explique le pipeline
`ml/ocr/` : le problème, la solution, les 3 étapes (dataset synthétique,
fine-tune TrOCR, métrique CER) et le résultat dans le launcher.

- **Rendu final** : `out/explainer-ocr.mp4` (1280×720, 30 fps, ~53 s, narration + légendes incrustées)
- Style : les tokens du launcher (`assets/css/design.css` — fond sombre, accent orange, cartes glass)
- Police : Inter embarquée (copiée depuis `assets/fonts/`)

## Structure

```
├── gen_vo.py          ← génère la narration (edge-tts) + timings.json (bornes mot à mot)
├── timings.json       ← durées de scènes et bornes de mots (pilote tout le montage)
├── src/
│   ├── Explainer.tsx  ← composition : séquences, audio, légendes synchronisées
│   ├── scenes.tsx     ← les 6 scènes animées
│   ├── timing.ts      ← scènes + légendes dérivées de timings.json
│   └── style.ts       ← tokens du launcher
└── public/
    ├── audio/line*.mp3  ← narration
    └── fonts/*.woff2    ← Inter
```

## Régénérer

```bash
npm install
python3 gen_vo.py                 # narration + timings (nécessite edge-tts : pip install edge-tts)
npx remotion render Explainer out/explainer-ocr.mp4
```

Tout est déterministe : la narration, les durées de scènes et les
légendes dérivent du même `timings.json` — les légendes ne peuvent pas
dériver par rapport à la voix.

## Le script (structure problem → solution → how → payoff)

| # | Scène | VO |
| --- | --- | --- |
| 0 | Le problème — 3 documents, « tout retaper à la main ? » | Tes notes de cours… |
| 1 | La solution — « Un modèle OCR local » | Pas besoin. On va entraîner… |
| 2 | Étape 1 — 50 000 lignes générées + augmentations | Étape un : on génère… |
| 3 | Étape 2 — diagramme TrOCR (œil → bouche) | Étape deux : on fine-tune… |
| 4 | Étape 3 — le CER descend vers 4,8 % | Étape trois : on mesure… |
| 5 | Le résultat dans le launcher + CTA | Résultat : ton texte sort de l'image… |
