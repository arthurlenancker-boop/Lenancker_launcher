#!/usr/bin/env python3
"""Génère la narration VO (edge-tts, voix fr) + les timings mot à mot.

Sortie :
    public/audio/lineN.mp3        (un fichier par ligne de script)
    timings.json                 (durées et bornes de mots par ligne)
"""

import asyncio
import json
import math
from pathlib import Path

import edge_tts

VOIX = "fr-FR-DeniseNeural"

# Script VO — structure problem -> solution -> how (3 étapes) -> payoff
LIGNES = [
    "Tes notes de cours. Des photos de tableaux. Des PDF partout. Tout ça, il faudrait le retaper à la main.",
    "Pas besoin. On va entraîner un modèle OCR, pour toi, qui tourne hors-ligne.",
    "Étape un : on génère cinquante mille lignes de texte — français, anglais, formules de maths — et on les abîme comme de vraies photos : bruit, flou, rotation.",
    "Étape deux : on fine-tune TrOCR. Un encodeur qui regarde l'image. Un décodeur qui écrit, caractère par caractère.",
    "Étape trois : on mesure. Le CER, c'est le taux d'erreur par caractère. Objectif : moins de cinq pour cent.",
    "Résultat : ton texte sort de l'image, directement dans le launcher. Le code est prêt. Lance l'entraînement.",
]

FPS = 30


async def gen_ligne(i, texte):
    chemin = Path("public/audio/line%d.mp3" % i)
    comm = edge_tts.Communicate(texte, VOIX, rate="-4%", boundary="WordBoundary")
    mots = []
    with open(chemin, "wb") as f:
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                mots.append({
                    "mot": chunk["text"],
                    "debut_s": chunk["offset"] / 1e7,
                    "fin_s": (chunk["offset"] + chunk["duration"]) / 1e7,
                })
    duree = (mots[-1]["fin_s"] if mots else 2.0) + 0.45  # respiration
    print("ligne %d : %.2fs (%d mots)" % (i, duree, len(mots)))
    return {"texte": texte, "duree_s": round(duree, 3), "mots": mots}


async def main():
    Path("public/audio").mkdir(parents=True, exist_ok=True)
    lignes = []
    for i, t in enumerate(LIGNES):
        lignes.append(await gen_ligne(i, t))
    total = sum(l["duree_s"] for l in lignes)
    data = {"fps": FPS, "lignes": lignes, "total_s": round(total, 3),
            "total_frames": math.ceil(total * FPS)}
    with open("timings.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print("TOTAL : %.1fs = %d frames" % (total, data["total_frames"]))


if __name__ == "__main__":
    asyncio.run(main())
