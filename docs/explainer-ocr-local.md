# Explainer — Le modèle OCR local : comment il marche et pourquoi

Ce document explique, de zéro, le pipeline d'entraînement qui vit dans
`ml/ocr/` : ce qu'est un modèle OCR, comment TrOCR fonctionne, pourquoi
on fine-tune au lieu d'entraîner from scratch, d'où viennent les données,
comment on mesure la qualité, et comment tout ça s'articule avec le
launcher.

---

## 1. Le problème : transformer une image en texte

L'OCR (*Optical Character Recognition*) est la tâche : **image d'une ligne
de texte → la chaîne de caractères qu'elle contient**. Formellement, c'est
un modèle qui apprend la distribution

```
P(texte | image)
```

L'OCR complet d'une page se décompose en deux sous-tâches **distinctes** :

1. **Détection** — trouver *où* est le texte dans la page (boîtes autour
   de chaque ligne). C'est un problème de vision « classique », bien
   résolu par des outils dédiés (PaddleOCR, CRAFT).
2. **Reconnaissance** — lire *ce que dit* chaque ligne découpée. C'est
   ici qu'un modèle entraîné sur tes données fait la différence
   (accents français, symboles maths…).

Notre modèle ne fait **que la reconnaissance**. La détection est confiée
à un outil externe : chaque brique fait ce qu'elle sait faire le mieux.

---

## 2. Pourquoi fine-tuner et pas entraîner from scratch

Entraîner un modèle de reconnaissance from scratch exigerait des millions
d'images annotées et des semaines de GPU. On part au contraire d'un
modèle **pré-entraîné** qui sait déjà « voir » du texte et écrire des
mots, et on l'adapte :

| | From scratch | Fine-tune (notre choix) |
| --- | --- | --- |
| Données nécessaires | ~millions | ~50 000 lignes |
| Temps GPU (8 Go) | semaines | quelques heures |
| Connaissance du texte | aucune | héritée du pré-entraînement |
| Contrôle | total | largement suffisant |

**TrOCR** (Microsoft, 2021) est le modèle de départ :
`microsoft/trocr-base-printed`. Il a été pré-entraîné sur IAM (texte
imprimé) — exactement notre cas d'usage.

---

## 3. L'architecture TrOCR : un œil et une bouche

TrOCR est un modèle **encodeur-décodeur**, composé de deux blocs :

```
image de ligne (384×384)
        │
        ▼
┌──────────────────┐
│ ENCODEUR : ViT    │  « l'œil » — découpe l'image en 16×16 = 576 patchs,
│ (Vision Transf.)  │  chaque patch devient un « mot visuel » (vecteur),
│                   │  puis l'attention met en relation tous les patchs
└──────────────────┘
        │  576 vecteurs de contexte visuel
        ▼
┌──────────────────┐
│ DÉCODEUR : Transf.│  « la bouche » — génère le texte UN CARACTÈRE À LA
│ texte (GPT-like)  │  FOIS, en regardant l'image à chaque étape :
│                   │  P(x_1, x_2, …, x_n | image)
└──────────────────┘
        │
        ▼
"f(x) = lim [f(x+h) − f(x)] / h"
```

Point clé : le décodeur est **autoregressif** — il écrit le i-ème
caractère en fonction des i−1 déjà écrits et de l'image. C'est ce qui lui
permet de gérer les ambiguïtés (un « rn » mal imprimé lu « m », une
liaison contextuelle) exactement comme un humain relit avec le contexte.

L'entraînement minimise la **cross-entropy** : pour chaque image, on
maximise la log-vraisemblance de la transcription correcte, caractère par
caractère.

---

## 4. Les données : pourquoi du synthétique (et pourquoi ça marche)

Le nerf de la guerre en ML, c'est le dataset. Annoter 50 000 lignes à la
main = des semaines. On les **génère** à la place :

1. On tire un texte : phrase française/anglaise, formule maths
   (∫₀^∞ e^(−x²) dx, ∀ε>0 ∃N∈ℕ…), ou suite aléatoire de symboles.
2. On le **rend** avec PIL (Pillow) : police aléatoire, taille aléatoire.
3. On applique des **augmentations** qui simulent une photo de page :

| Augmentation | Ce qu'elle simule |
| --- | --- |
| Rotation ±2° | page penchée sur la table |
| Perspective douce | photo prise de biais |
| Luminosité ±25 % | ombre / surexposition |
| Contraste variable | photocopies pâles |
| Flou gaussien | mise au point imparfaite du téléphone |
| Bruit gaussien | capteur du téléphone |

Résultat : des milliers d'exemples parfaitement étiquetés (on connaît le
texte par construction — zéro erreur d'annotation), couvrant
exactement **nos** cas : accents français, symboles maths, photos de
cours. Le dataset vise ~50 000 lignes + 2 000 pour la validation.

À terme, on peut enrichir avec de vraies lignes découpées de tes
documents — le modèle apprend alors le « style » réel de tes scans.

---

## 5. L'entraînement, calibré pour 8 Go de VRAM

Le budget mémoire est la contrainte centrale. Les leviers utilisés dans
`train_trocr.py` :

- **fp16 (mixed precision)** : les calculs en demi-précision → ÷2 la
  mémoire, ×2 la vitesse, quasi aucune perte de qualité.
- **Batch 8 + accumulation 4** : le gradient est moyenné sur
  4 mini-lots avant la mise à jour → « batch effectif » de 32 avec la
  mémoire d'un batch de 8.
- **Warmup 5 %** : le learning rate monte doucement au début pour éviter
  de détruire les poids pré-entraînés.
- **LR 5e-5** : petit, typique d'un fine-tune — on adapte, on ne
  réécrit pas tout.

Chaque epoch, le modèle est évalué sur la validation ; le checkpoint au
**meilleur CER** est conservé automatiquement.

---

## 6. Mesurer la qualité : le CER

La métrique de référence est le **CER** (*Character Error Rate*) :

```
CER = distance d'édition(référence, prédiction) / longueur(référence)
```

La distance d'édition compte le nombre minimal d'opérations
(insertion / suppression / substitution) pour transformer la prédiction en
vérité. CER = 0 → parfait ; CER = 0,05 → en moyenne 5 % des caractères
sont faux.

**Objectifs** : CER < 5 % sur imprimé propre, < 10 % sur photos de
pages. Pourquoi pas 0 ? Parce qu'entre 5 % et 0 % il y a souvent des
ambiguïtés réelles (coupure de scan, encre effacée) — et surtout parce
que le CER compte les différences *de caractères*, pas de sens : « − »
vs « - » (tiret) compte comme une erreur alors que le texte est lisible.

On surveille aussi le **surapprentissage** : si le CER de validation
remonte pendant que celui d'entraînement baisse, le modèle apprend « par
cœur » le synthétique → il faut plus de variété dans les données.

---

## 7. Utilisation et mode hybride

Le modèle entraîné vit dans `checkpoints/ocr-fr/` et s'utilise en local :

```bash
python infer.py --model checkpoints/ocr-fr ma_ligne.png
```

Dans le launcher, l'articulation avec l'app OCR existante :

```
             ┌──────────────┐
   image ───►│ API Mistral  │ (mode cloud : précis, complet)
             │ (apps/ocr/)  │
             └──────────────┘
                    │ si pas de réseau / pas de clé
                    ▼
             ┌──────────────┐
             │ modèle local │ (hors-ligne : TrOCR fine-tuné
             │ ml/ocr/      │  + PaddleOCR pour la détection)
             └──────────────┘
```

Le modèle local peut être exporté en **ONNX** (voir `ml/ocr/README.md`)
pour une inférence rapide même sur CPU — utile dans le wrapper Electron.

---

## 8. Résumé en une phrase par étape

1. **Générer** : 50 000 lignes synthétiques FR/EN/maths, augmentées
   comme des photos.
2. **Fine-tuner** : TrOCR pré-entraîné, adapté en quelques heures sur
   8 Go de VRAM.
3. **Évaluer** : CER < 5 % visé sur imprimé.
4. **Déployer** : inférence locale hors-ligne, ONNX pour l'Electron,
   hybride avec l'API Mistral.

---

*Référence : Li et al., « TrOCR: Transformer-based Optical Character
Recognition with Pre-trained Models », AAAI 2022.*
