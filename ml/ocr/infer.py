#!/usr/bin/env python3
"""Inférence OCR locale : reconnaît le texte d'images de LIGNES.

La détection de zones de texte (découpage en lignes) est faite en amont,
par exemple avec PaddleOCR ou CRAFT — ce script ne fait que la reconnaissance.

Usage :
    python infer.py --model checkpoints/ocr-fr image1.png image2.png
    python infer.py --model checkpoints/ocr-fr --images-dir dataset/val/images
"""

import argparse
from pathlib import Path

import torch
from PIL import Image
from transformers import TrOCRProcessor, VisionEncoderDecoderModel


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("images", nargs="*")
    ap.add_argument("--images-dir", help="reconnaître toutes les images d'un dossier")
    args = ap.parse_args()

    chemins = [Path(p) for p in args.images]
    if args.images_dir:
        d = Path(args.images_dir)
        chemins += sorted(p for p in d.iterdir() if p.suffix.lower() in (".png", ".jpg", ".jpeg", ".bmp"))
    if not chemins:
        ap.error("aucune image fournie")

    processor = TrOCRProcessor.from_pretrained(args.model)
    model = VisionEncoderDecoderModel.from_pretrained(args.model)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(device).eval()

    with torch.no_grad():
        for chemin in chemins:
            img = Image.open(chemin).convert("RGB")
            pixels = processor(images=img, return_tensors="pt").pixel_values.to(device)
            ids = model.generate(pixels, max_length=64)
            texte = processor.batch_decode(ids, skip_special_tokens=True)[0]
            print("%s\t%s" % (chemin.name, texte))


if __name__ == "__main__":
    main()
