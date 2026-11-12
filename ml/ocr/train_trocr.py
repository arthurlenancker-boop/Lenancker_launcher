#!/usr/bin/env python3
"""Fine-tune TrOCR pour la reconnaissance de lignes (français/anglais/maths).

Calibré pour 8 Go de VRAM : fp16, batch 8 + accumulation 4, resize 384×384.

Usage :
    python train_trocr.py --train dataset/train --val dataset/val \
        --base microsoft/trocr-base-printed --out checkpoints/ocr-fr
"""

import argparse
import random
from pathlib import Path

import torch
from PIL import Image
from torch.utils.data import Dataset
from transformers import (
    Trainer,
    TrainingArguments,
    TrOCRForCausalLM,
    TrOCRProcessor,
    VisionEncoderDecoderModel,
    ViTImageProcessor,
)


def lire_labels(dossier):
    lignes = []
    with open(Path(dossier) / "labels.txt", encoding="utf-8") as f:
        for ligne in f:
            ligne = ligne.rstrip("\n")
            if not ligne:
                continue
            img, texte = ligne.split("\t", 1)
            lignes.append((Path(dossier) / img, texte))
    return lignes


class LignesOCR(Dataset):
    def __init__(self, exemples, processor):
        self.exemples = exemples
        self.processor = processor

    def __len__(self):
        return len(self.exemples)

    def __getitem__(self, idx):
        chemin, texte = self.exemples[idx]
        img = Image.open(chemin).convert("RGB")
        pixels = self.processor(images=img, return_tensors="pt").pixel_values[0]
        labels = self.processor.tokenizer(
            texte, padding="max_length", max_length=64, truncation=True
        ).input_ids
        labels = [l if l != self.processor.tokenizer.pad_token_id else -100
                  for l in labels]
        return {"pixel_values": pixels, "labels": torch.tensor(labels)}


def cer(reference, hypothese):
    import editdistance
    return editdistance.eval(reference, hypothese) / max(1, len(reference))


def calculer_cer(eval_pred, tokenizer):
    logits, labels = eval_pred
    pred_ids = logits.argmax(-1)
    pred_str = tokenizer.batch_decode(pred_ids, skip_special_tokens=True)
    labels = [[l for l in lab if l != -100] for lab in labels]
    ref_str = tokenizer.batch_decode(labels, skip_special_tokens=True)
    total = sum(cer(r, h) for r, h in zip(ref_str, pred_str))
    return {"cer": total / max(1, len(ref_str))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--train", required=True)
    ap.add_argument("--val", required=True)
    ap.add_argument("--base", default="microsoft/trocr-base-printed")
    ap.add_argument("--out", default="checkpoints/ocr-fr")
    ap.add_argument("--epochs", type=int, default=10)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--accum", type=int, default=4)
    ap.add_argument("--lr", type=float, default=5e-5)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    random.seed(args.seed)
    torch.manual_seed(args.seed)

    image_processor = ViTImageProcessor.from_pretrained(args.base)
    tokenizer = TrOCRForCausalLM.from_pretrained(args.base).decoder.tokenizer
    processor = TrOCRProcessor(image_processor, tokenizer)

    model = VisionEncoderDecoderModel.from_pretrained(args.base)
    model.config.decoder_start_token_id = tokenizer.bos_token_id
    model.config.pad_token_id = tokenizer.pad_token_id
    model.config.vocab_size = model.config.decoder.vocab_size
    model.config.eos_token_id = tokenizer.eos_token_id
    model.config.max_length = 64
    model.config.early_stopping = True
    model.config.no_repeat_ngram_size = 3

    train_ds = LignesOCR(lire_labels(args.train), processor)
    val_ds = LignesOCR(lire_labels(args.val), processor)

    targs = TrainingArguments(
        output_dir=args.out,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch,
        per_device_eval_batch_size=args.batch,
        gradient_accumulation_steps=args.accum,
        learning_rate=args.lr,
        warmup_ratio=0.05,
        weight_decay=0.01,
        fp16=torch.cuda.is_available(),
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=2,
        load_best_model_at_end=True,
        metric_for_best_model="cer",
        greater_is_better=False,
        logging_steps=100,
        report_to="none",
        seed=args.seed,
    )

    trainer = Trainer(
        model=model,
        args=targs,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        compute_metrics=lambda p: calculer_cer(p, tokenizer),
    )
    trainer.train()

    trainer.save_model(args.out)
    processor.save_pretrained(args.out)
    print("Modèle sauvegardé dans %s" % args.out)


if __name__ == "__main__":
    main()
