#!/usr/bin/env python3
"""Évalue un checkpoint TrOCR : CER global + exemples d'erreurs.

Usage :
    python evaluate.py --model checkpoints/ocr-fr --val dataset/val [--show 10]
"""

import argparse
from pathlib import Path

import torch
from PIL import Image
from transformers import TrOCRProcessor, VisionEncoderDecoderModel


def cer(reference, hypothese):
    import editdistance
    return editdistance.eval(reference, hypothese) / max(1, len(reference))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--val", required=True)
    ap.add_argument("--show", type=int, default=10,
                    help="nombre d'exemples d'erreur à afficher")
    args = ap.parse_args()

    processor = TrOCRProcessor.from_pretrained(args.model)
    model = VisionEncoderDecoderModel.from_pretrained(args.model)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(device).eval()

    exemples = []
    with open(Path(args.val) / "labels.txt", encoding="utf-8") as f:
        for ligne in f:
            ligne = ligne.rstrip("\n")
            if ligne:
                img, texte = ligne.split("\t", 1)
                exemples.append((Path(args.val) / img, texte))

    total = 0.0
    erreurs = []
    with torch.no_grad():
        for i, (chemin, ref) in enumerate(exemples):
            img = Image.open(chemin).convert("RGB")
            pixels = processor(images=img, return_tensors="pt").pixel_values.to(device)
            ids = model.generate(pixels, max_length=64)
            hyp = processor.batch_decode(ids, skip_special_tokens=True)[0]
            c = cer(ref, hyp)
            total += c
            if c > 0:
                erreurs.append((c, ref, hyp))
            if (i + 1) % 500 == 0:
                print("%d / %d — CER moyen : %.4f" % (i + 1, len(exemples), total / (i + 1)))

    print("\nCER final : %.4f (%d exemples)" % (total / max(1, len(exemples)), len(exemples)))
    erreurs.sort(key=lambda e: -e[0])
    for c, ref, hyp in erreurs[: args.show]:
        print("CER %.3f\n  ref : %s\n  hyp : %s" % (c, ref, hyp))


if __name__ == "__main__":
    main()
