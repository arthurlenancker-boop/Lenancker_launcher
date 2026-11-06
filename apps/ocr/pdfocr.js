/* pdfocr.js — PDF « sandwich » : l'image du scan telle quelle (JPEG/PNG d'origine,
   sans recompression) + une couche de texte invisible positionnée sur les bbox
   renvoyés par l'API OCR Mistral (include_blocks), ce qui rend le texte
   sélectionnable/copiable dans n'importe quel lecteur PDF.
   Les blocs Mistral utilisent des coordonnées en pixels de l'image (origine
   en haut à gauche) : top_left_x, top_left_y, bottom_right_x, bottom_right_y.
   UMD : window.PdfOcr dans le navigateur, module.exports sous Node (tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PdfOcr = factory();
  }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /* pdf-lib est résolu à l'usage (buildSearchablePdf) : ce module se charge
     donc à vide sans lui, et reste utilisable pour les maths de redressement
     (bestSkewAngle, rotationSize) qui servent avant tout export PDF. */

  const A4_LONG_PT = 841.89;  // côté long d'une page A4
  const A4_RATIO = 210 / 297; // côté court / côté long

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /* ---------- Texte sûr pour les polices standard du PDF (WinAnsi) ----------
     Les polices PDF standard (Helvetica) n'encodent qu'un jeu limité de
     caractères ; les signes typographiques fréquents de l'OCR sont convertis
     et le reste est retiré (le texte parfait reste disponible via .md/.docx). */
  const CHAR_MAP = {
    '\u2018': "'", '\u2019': "'", '\u201A': ',', '\u201B': "'",
    '\u201C': '"', '\u201D': '"', '\u201E': '"',
    '\u2013': '-', '\u2014': '-', '\u2212': '-', '\u2010': '-', '\u2011': '-',
    '\u2026': '...',
    '\u2022': '-', '\u25CF': '-', '\u25AA': '-', '\u00B7': '-',
    '\u2192': '->', '\u2190': '<-', '\u21D2': '=>', '\u2264': '<=', '\u2265': '>=',
    '\u00B1': '+-', '\u2039': '<', '\u203A': '>', '\u02DC': '~', '\u02C6': '^',
    '\u0153': 'oe', '\u0152': 'OE', '\u00A0': ' ', '\u00AD': '',
    '\u221A': 'V', '\u221E': 'inf', '\u2208': ' in ', '\u00D7': 'x',
  };

  function toWinAnsi(text) {
    let s = String(text || '');
    for (const [k, v] of Object.entries(CHAR_MAP)) s = s.split(k).join(v);
    return s.replace(/[^\t\n\x20-\x7E\u00A1-\u00FF\u0160\u0161\u017D\u017E\u0192\u20AC\u2122]/g, '');
  }

  /* Nettoie le contenu markdown d'un bloc : le calque texte ne doit pas
     contenir la syntaxe markdown elle-même. */
  function cleanBlockContent(content) {
    let s = String(content || '');
    s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');      // images
    s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');   // liens -> texte seul
    s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '');        // titres
    s = s.replace(/\*\*|__|~~|`/g, '');              // emphase, code inline
    return s.trim();
  }

  /* ---------- Format de page ----------
     px du scan -> points PDF à la taille physique réelle.
     dpi connu : px / dpi * 72. Sinon : ratio A4 => A4 exact, sinon 300 dpi. */
  function pickPageSize(pxW, pxH, dpi) {
    let scale;
    const validDpi = Number(dpi) >= 50 && Number(dpi) <= 1200;
    const ratio = pxW / pxH;
    const ratioA4 = ratio >= A4_RATIO ? ratio : 1 / ratio; // portrait ou paysage
    if (validDpi) {
      scale = 72 / Number(dpi);
    } else if (Math.abs(ratioA4 / A4_RATIO - 1) <= 0.07) {
      // page A4 (le côté long de la feuille vaut 841.89 pt)
      scale = A4_LONG_PT / Math.max(pxW, pxH);
    } else {
      scale = 72 / 300; // hypothèse : scan/photo standard à 300 dpi
    }
    let wPt = pxW * scale, hPt = pxH * scale;
    if (Math.max(wPt, hPt) > 14400) { // limite PDF (200 pouces)
      const k = 14400 / Math.max(wPt, hPt);
      wPt *= k; hPt *= k;
    }
    return { scale, wPt: Math.max(9, wPt), hPt: Math.max(9, hPt) };
  }

  /* ---------- Calque de texte invisible ----------
     Un bloc de plusieurs lignes : les lignes sont réparties uniformément sur la
     hauteur de la bbox ; chaque ligne est dessinée en mode invisible (opacité 0),
     avec un léger rétrécissement si elle déborde de la largeur du bloc. */
  function drawTextLayer(page, font, segs, opts) {
    for (const seg of segs || []) {
      const text = toWinAnsi(cleanBlockContent(seg.text));
      if (!text) continue;
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!lines.length) continue;

      const x0 = clamp(seg.x0 - opts.visLeft, 0, opts.visW);
      const boxW = clamp(seg.x1 - seg.x0, 2, opts.visW);
      const boxH = clamp(seg.y1 - seg.y0, 2, opts.visH);
      const lineHpx = boxH / lines.length;

      lines.forEach((line, i) => {
        let size = clamp(lineHpx * opts.scale * 0.82, 1, 160);
        try {
          const lw = font.widthOfTextAtSize(line, size);
          const maxW = boxW * opts.scale;
          if (lw > maxW && lw > 0) size = Math.max(1, size * (maxW / lw));
        } catch { /* largeur indisponible : taille d'origine */ }
        const topPx = clamp(seg.y0 - opts.visTop, 0, opts.visH) + i * lineHpx;
        const baselinePt = opts.hPt - (topPx + lineHpx * 0.82) * opts.scale;
        try {
          page.drawText(line, {
            x: x0 * opts.scale,
            y: clamp(baselinePt, 0, opts.hPt),
            size,
            font,
            opacity: 0,
          });
        } catch { /* caractère exotique résiduel : on ignore cette ligne */ }
      });
    }
  }

  /* ---------- Construction ----------
     pages : [{
       bytes (Uint8Array), mime 'image/jpeg' | 'image/png',
       widthPx, heightPx, dpi|null,
       trim {left,top,right,bottom} en px | null,
       segments [{x0,y0,x1,y1,text}]  (px image, origine haut-gauche)
     }]
     -> Uint8Array du PDF. */
  async function buildSearchablePdf(pages, title) {
    const scope = typeof self !== 'undefined' ? self : globalThis;
    const lib = scope.PDFLib;
    if (!lib) throw new Error('pdf-lib non chargé — export PDF indisponible.');
    const { PDFDocument, StandardFonts } = lib;
    const doc = await PDFDocument.create();
    doc.setProducer('Lenancker Launcher — OCR Mistral');
    if (title) doc.setTitle(title);
    const font = await doc.embedFont(StandardFonts.Helvetica);

    for (const p of pages) {
      const img = p.mime === 'image/jpeg' ? await doc.embedJpg(p.bytes) : await doc.embedPng(p.bytes);
      const tr = p.trim || { left: 0, top: 0, right: 0, bottom: 0 };
      const visW = clamp(p.widthPx - tr.left - tr.right, 1, p.widthPx);
      const visH = clamp(p.heightPx - tr.top - tr.bottom, 1, p.heightPx);
      const { scale, wPt, hPt } = pickPageSize(visW, visH, p.dpi);
      const page = doc.addPage([wPt, hPt]);

      // image pleine résolution, décalée pour ne montrer que la zone visible
      page.drawImage(img, {
        x: -tr.left * scale,
        y: -tr.bottom * scale,
        width: p.widthPx * scale,
        height: p.heightPx * scale,
      });

      drawTextLayer(page, font, p.segments, {
        scale, wPt, hPt,
        visLeft: tr.left, visTop: tr.top, visW, visH,
      });
    }

    return doc.save();
  }

  /* ---------- Détourage : maths pures (testables sous Node) ----------
     rowMean/colMean : luminance moyenne [0..1] par ligne/colonne du scan
     réduit. On cherche la zone « page claire » sur fond plus sombre (table).
     Retour {top,right,bottom,left} dans l'espace des indices fournis, ou null
     si rien d'évident (garde-fous : jamais plus de 45 % par côté, la zone
     trouvée doit garder au moins 35 % de chaque dimension). */
  function insetsFromProfiles(rowMean, colMean) {
    const h = rowMean.length, w = colMean.length;
    if (!h || !w) return null;

    const sorted = Array.from(rowMean).sort((a, b) => a - b);
    const bright = sorted[Math.floor(sorted.length * 0.8)] || 0;
    const thr = Math.max(0.36, bright * 0.58);

    const edge = (arr, fromStart) => {
      const limit = Math.floor(arr.length * 0.45);
      let n = 0;
      while (n < limit && arr[fromStart ? n : arr.length - 1 - n] < thr) n++;
      return n < limit ? n : -1;
    };

    const top = edge(rowMean, true);
    const bottom = edge(rowMean, false);
    if (top < 0 || bottom < 0) return null;
    const left = edge(colMean, true);
    const right = edge(colMean, false);
    if (left < 0 || right < 0) return null;

    if (h - top - bottom < h * 0.35 || w - left - right < w * 0.35) return null;
    if ((top + bottom) / h < 0.01 && (left + right) / w < 0.01) return null;

    return { top, right, bottom, left };
  }

  /* ---------- Redressement des scans penchés : maths pures (testables sous Node) ----------
     Méthode classique du profil de projection : les lignes de texte forment un
     peigne régulier ; pour l'angle qui aligne le profil horizontal sur les lignes,
     la variance des comptes par ligne binner est maximale.
     xs, ys : coordonnées (px) des pixels d'encre dans l'image réduite ; w, h :
     dimensions de cette image réduite. Signe : angle > 0 = texte qui descend
     vers la droite ; pour l'aplatir, rotation canvas de -angle (radians). */
  const D2R = Math.PI / 180;

  function bestSkewAngle(xs, ys, w, h) {
    const n = xs ? xs.length : 0;
    if (!ys || n !== ys.length || n < 256) return null;
    const margin = Math.ceil(Math.tan(6 * D2R) * (w / 2)) + 2; // décalage max introduit à ±6°
    const binLen = (h | 0) + 2 * margin;
    const bins = new Uint32Array(binLen);
    const rel = new Float32Array(n);
    for (let i = 0; i < n; i++) rel[i] = xs[i] - w / 2;

    const score = (deg) => {
      bins.fill(0);
      const k = Math.tan(deg * D2R);
      for (let i = 0; i < n; i++) {
        // recentrage par la marge : chaque point reste dans [0, binLen-1],
        // aucun angle n'est favorisé par des lignes entassées en bord de profil
        const b = (ys[i] - k * rel[i] + margin) | 0;
        bins[b < 0 ? 0 : b >= binLen ? binLen - 1 : b]++;
      }
      let s = 0;
      for (let j = 0; j < binLen; j++) { const v = bins[j]; s += v * v; }
      return s;
    };

    // 1. recherche grossière ±6° au pas de 0,25°
    let best = 0, bestS = -1;
    for (let d = -6; d <= 6.0001; d += 0.25) {
      const s = score(d);
      if (s > bestS) { bestS = s; best = d; }
    }
    // 2. recherche fine ±0,3° autour du meilleur, pas de 0,05°
    let fine = best, fineS = bestS;
    for (let d = best - 0.3; d <= best + 0.3001; d += 0.05) {
      const s = score(d);
      if (s > fineS) { fineS = s; fine = d; }
    }
    const s0 = score(0);
    const gain = s0 > 0 ? fineS / s0 : 1;
    if (gain < 1.06) return null; // pas de peigne net : photo sans lignes, page à peine texturée…
    if (Math.abs(fine) < 0.3 || Math.abs(fine) > 6) return null; // déjà droit, ou hors plage
    return { angle: Math.round(fine * 100) / 100, gain: Math.round(gain * 100) / 100 };
  }

  /* Dimensions du canevas contenant l'image tournée d'angleDeg sans aucune
     perte : un même { w, h, angle } redonne toujours les mêmes dimensions,
     en intake comme à l'export PDF (les bbox OCR restent ainsi alignés). */

  function rotationSize(w, h, angleDeg) {
    const a = Math.abs(angleDeg) * D2R;
    const c = Math.cos(a), s = Math.sin(a);
    return {
      w: Math.max(1, Math.round(w * c + h * s)),
      h: Math.max(1, Math.round(w * s + h * c)),
    };
  }

  return {
    buildSearchablePdf,
    toWinAnsi,
    cleanBlockContent,
    pickPageSize,
    insetsFromProfiles,
    bestSkewAngle,
    rotationSize,
  };
});
