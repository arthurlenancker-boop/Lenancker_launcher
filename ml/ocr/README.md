# Modèle OCR local (fine-tune TrOCR)

Pipeline d'entraînement d'un modèle OCR **local et hors-ligne** pour la
reconnaissance de lignes de texte **français / anglais / symboles
maths-science** — pensé comme complément de l'app `apps/ocr/` (API Mistral) :
le mode hybride utilise le modèle local quand le réseau ou la clé API
manquent.

Conçu pour un GPU **8 Go de VRAM** (fp16, batch 8 + accumulation 4).

## Contenu

| Fichier | Rôle |
| --- | --- |
| `generate_dataset.py` | Génère un dataset synthétique de lignes (texte FR/EN + formules maths) avec augmentations photo (bruit, flou, éclairage, rotation, perspective) |
| `train_trocr.py` | Fine-tune `microsoft/trocr-base-printed` (ViT encoder + décodeur texte), CER suivi à chaque epoch |
| `evaluate.py` | Évalue un checkpoint : CER global + pires exemples |
| `infer.py` | Reconnaissance de lignes (inférence), pour intégration locale |
| `requirements.txt` | Dépendances PyTorch / Transformers / Pillow |

## 1. Installation

```bash
cd ml/ocr
python -m venv .venv && source .venv/bin/activate   # ou .venv\Scripts\activate sur Windows
pip install -r requirements.txt
```

## 2. Polices (important)

Le rendu synthétique est bien meilleur avec de vraies polices. Place des
fichiers `.ttf`/`.otf` dans `ml/ocr/fonts/` — par exemple des polices
libres (Inter, DejaVu, Liberation, Computer Modern pour les maths).

## 3. Générer le dataset

```bash
python generate_dataset.py --n 50000 --out dataset/train --seed 42
python generate_dataset.py --n 2000  --out dataset/val   --seed 43
```

Chaque image est une **ligne de texte** ; `labels.txt` associe
`images/xxxxx.png` → transcription. On peut ensuite enrichir `train` avec
des lignes réelles découpées de tes documents (photos de cours), annotées
à la main.

## 4. Entraîner (8 Go VRAM)

```bash
python train_trocr.py --train dataset/train --val dataset/val \
    --base microsoft/trocr-base-printed --out checkpoints/ocr-fr \
    --epochs 10 --batch 8 --accum 4
```

Quelques heures sur un RTX 3060/4060 pour 50k lignes. Le meilleur
checkpoint (CER le plus bas) est conservé dans `checkpoints/ocr-fr/`.

## 5. Évaluer

```bash
python evaluate.py --model checkpoints/ocr-fr --val dataset/val --show 10
```

Objectif réaliste : **CER < 5 %** sur imprimé propre, < 10 % sur photos.

## 6. Utiliser (hors-ligne)

```bash
python infer.py --model checkpoints/ocr-fr ma_ligne.png
```

La **détection** des lignes dans une page complète se fait en amont avec
un outil dédié (PaddleOCR ou CRAFT) : ce modèle ne fait que la
**reconnaissance** — c'est la tâche qui mérite un modèle entraîné.

### Export ONNX (optionnel, pour l'intégration Electron)

```bash
pip install optimum[onnxruntime]
optimum-cli export onnx --model checkpoints/ocr-fr onnx/ocr-fr
```

## Structure de sortie

```
checkpoints/ocr-fr/
├── config.json, model.safetensors   ← le modèle fine-tuné
├── preprocessor_config.json         ← le ViTImageProcessor
└── tokenizer.json / vocab           ← le décodeur texte
```
