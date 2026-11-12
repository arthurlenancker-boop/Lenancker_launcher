#!/usr/bin/env python3
"""Générateur de dataset synthétique pour l'entraînement OCR.

Produit des images de LIGNES de texte (imprimé français/anglais + maths)
avec augmentations simulant une photo de page : bruit, flou, éclairage,
légère rotation, perspective douce.

Sortie :
    <out>/images/xxxxx.png   (ligne de texte, hauteur variable)
    <out>/labels.txt         (une ligne par image : "images/xxxxx.png<TAB>texte")

Usage :
    python generate_dataset.py --n 50000 --out dataset/train
    python generate_dataset.py --n 2000 --out dataset/val
"""

import argparse
import math
import random
import string
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

MOTS_FR = """la théorie des ensembles une fonction continue dérivée partielle
l'intégrale définie sur un intervalle borné converge uniformément vers une
limite finie si et seulement si la suite est de Cauchy le théorème fondamental
de l'analyse affirme que toute fonction dérivable est continue réciproquement
l'ensemble des nombres premiers est infini la probabilité conditionnelle
l'espérance mathématique d'une variable aléatoire réelle la variance
l'équation différentielle du second ordre à coefficients constants
""".split()

MOTS_EN = """the fundamental theorem of calculus states that differentiation
is the inverse operation of integration a sequence converges if and only if
it is a Cauchy sequence the set of prime numbers is infinite conditional
probability expectation of a random variable variance linear algebra
matrix determinant eigenvalues orthogonal basis vector space dimension
""".split()

SYMBOLES = "+−×÷=≠≈≤≥±√∫∑∏∞∈⊂∪∩→⇔θλμσπΩαβγδφω"

MATH_MODELES = [
    "{a}x² + {b}x + {c} = 0",
    "{a}x + {b} = {c}",
    "∫₀^∞ e^(−{a}x²) dx = √π / 2",
    "∑_(k=1)^{a} k = {a}({a}+1)/2",
    "f'(x) = lim_(h→0) [f(x+h) − f(x)] / h",
    "P(A|B) = P(A∩B) / P(B)",
    "E[X] = ∑ xᵢ · pᵢ",
    "Var(X) = E[X²] − (E[X])²",
    "cos²θ + sin²θ = 1",
    "{a}·10^{b}",
    "√{a} + {b}",
    "Δ = b² − 4ac",
    "ln({a}) + ln({b}) = ln({a}·{b})",
    "∀ε > 0, ∃N ∈ ℕ, ∀n ≥ N : |aₙ − L| < ε",
    "dy/dx = {a}y",
]

POLICES_FALLBACK = None


def texte_aleatoire(rng):
    r = rng.random()
    if r < 0.45:
        mots = MOTS_FR
    elif r < 0.75:
        mots = MOTS_EN
    elif r < 0.9:
        return rng.choice(MATH_MODELES).format(
            a=rng.randint(2, 19), b=rng.randint(2, 99), c=rng.randint(2, 99)
        )
    else:
        n = rng.randint(3, 8)
        pool = string.ascii_letters + string.digits + " .,;:'\"()[]{}" + SYMBOLES
        return "".join(rng.choice(pool) for _ in range(n))
    n = rng.randint(5, 14)
    return " ".join(rng.choice(mots) for _ in range(n))


def charger_polices(dossier, rng):
    chemins = []
    if dossier:
        for ext in ("*.ttf", "*.otf"):
            chemins.extend(Path(dossier).glob(ext))
    polices = []
    for c in chemins:
        for taille in (30, 34, 38, 42, 46):
            try:
                polices.append(ImageFont.truetype(str(c), taille))
            except Exception:
                pass
    if not polices:
        sys.stderr.write(
            "AVERTISSEMENT : aucune police trouvée dans %s, "
            "police par défaut de PIL (qualité moindre).\n" % dossier
        )
        polices = [ImageFont.load_default()]
    return polices


def rendre_ligne(texte, police, rng):
    marge = 16
    # image large pour mesurer, on recadre ensuite
    img = Image.new("L", (2400, 128), 255)
    draw = ImageDraw.Draw(img)
    draw.text((marge, marge), texte, font=police, fill=0)
    boite = draw.textbbox((marge, marge), texte, font=police)
    w = boite[2] - boite[0] + 2 * marge
    h = boite[3] - boite[1] + 2 * marge
    img = img.crop((boite[0] - marge, boite[1] - marge, boite[0] - marge + w, boite[1] - marge + h))
    return augmenter(img, rng)


def augmenter(img, rng):
    # rotation légère (photo penchée)
    if rng.random() < 0.6:
        img = img.rotate(rng.uniform(-2.0, 2.0), expand=True, fillcolor=255,
                         resample=Image.BICUBIC)
    # perspective douce
    if rng.random() < 0.3:
        w, h = img.size
        k = rng.uniform(0.005, 0.02)
        coeffs = (1, rng.uniform(-k, k) * w, 0, 0, 1,
                  rng.uniform(-k, k) * h, rng.uniform(-k, k) * 1e-4,
                  rng.uniform(-k, k) * 1e-4)
        img = img.transform(img.size, Image.PERSPECTIVE, coeffs, fillcolor=255)
    # éclairage / contraste
    img = ImageEnhance.Brightness(img).enhance(rng.uniform(0.75, 1.15))
    img = ImageEnhance.Contrast(img).enhance(rng.uniform(0.8, 1.3))
    # flou (mise au point imparfaite)
    if rng.random() < 0.5:
        img = img.filter(ImageFilter.GaussianBlur(rng.uniform(0.3, 1.2)))
    # bruit gaussien
    if rng.random() < 0.7:
        import numpy as np
        arr = np.asarray(img).astype("float32")
        sigma = rng.uniform(3.0, 12.0)
        arr = arr + np.random.default_rng(rng.randint(1, 1 << 30)).normal(0, sigma, arr.shape)
        img = Image.fromarray(arr.clip(0, 255).astype("uint8"), "L")
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=50000, help="nombre d'images")
    ap.add_argument("--out", default="dataset/train", help="dossier de sortie")
    ap.add_argument("--fonts-dir", default="fonts",
                    help="dossier de polices .ttf/.otf (recommandé)")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    out = Path(args.out)
    (out / "images").mkdir(parents=True, exist_ok=True)

    rng = random.Random(args.seed)
    polices = charger_polices(args.fonts_dir, rng)

    labels = []
    for i in range(args.n):
        texte = texte_aleatoire(rng)
        img = rendre_ligne(texte, rng.choice(polices), rng)
        nom = "%s/%05d.png" % ("images", i)
        img.save(out / nom, "PNG")
        labels.append("%s\t%s" % (nom, texte))
        if (i + 1) % 5000 == 0:
            print("%d / %d" % (i + 1, args.n))

    with open(out / "labels.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(labels) + "\n")
    print("OK : %d images dans %s" % (args.n, out))


if __name__ == "__main__":
    main()
