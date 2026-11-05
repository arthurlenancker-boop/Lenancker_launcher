/* md2docx.js — Convertit du Markdown (sortie OCR Mistral) en document Word .docx.
   Basé sur le lexer de marked (tokens) + la librairie docx (window.docx / module docx).
   UMD : exposé en window.Md2Docx dans le navigateur, module.exports sous Node (tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root.marked, root.docx);
  } else {
    root.Md2Docx = factory(root.marked, root.docx);
  }
})(typeof self !== 'undefined' ? self : globalThis, function (marked, docx) {
  'use strict';

  const HEADING_KEYS = ['HEADING_1', 'HEADING_2', 'HEADING_3', 'HEADING_4', 'HEADING_5', 'HEADING_6'];

  function stripHtml(s) {
    return String(s).replace(/<[^>]*>/g, '');
  }

  /* Découpe un texte en runs docx en gérant le LaTeX inline produit par l'OCR :
     $...$ -> contenu sans délimiteurs, _{...} -> indice, ^{...} -> exposant. */
  function textToRuns(text, st) {
    const runs = [];
    const re = /\$([^$]+)\$|_\{([^}]+)\}|\^\{([^}]+)\}|\^(\d|[a-zA-Z])/g;
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) runs.push(new docx.TextRun({ text: text.slice(last, m.index), ...st }));
      if (m[1] !== undefined) runs.push(...textToRuns(m[1], st)); // $...$ : contenu retraité (indices/exposants)
      else if (m[2] !== undefined) runs.push(new docx.TextRun({ text: m[2], subScript: true, ...st }));
      else if (m[3] !== undefined || m[4] !== undefined) runs.push(new docx.TextRun({ text: m[3] || m[4], superScript: true, ...st }));
      last = re.lastIndex;
    }
    if (last < text.length) runs.push(new docx.TextRun({ text: text.slice(last), ...st }));
    return runs;
  }

  function dataUrlToBytes(dataUrl) {
    const base64 = String(dataUrl).split(',')[1] || '';
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  /* Taille ImageRun (px) : conserve le rapport largeur/hauteur réel quand la
     bbox de l'image est connue (renvoyée par l'API OCR), borné pour tenir
     dans une page Word. Sans bbox : repli 420x315. */
  function fitImageSize(dims) {
    const maxW = 460, maxH = 520;
    const w = dims ? Number(dims.w) : NaN;
    const h = dims ? Number(dims.h) : NaN;
    if (Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0) {
      const k = Math.min(maxW / w, maxH / h, 1.5);
      return { width: Math.max(16, Math.round(w * k)), height: Math.max(16, Math.round(h * k)) };
    }
    return { width: 420, height: 315 };
  }

  /* Convertit les tokens inline marked en TextRun docx. */
  function inlineToRuns(tokens, style, images, imageDims) {
    const runs = [];
    const st = style || {};
    for (const t of tokens || []) {
      switch (t.type) {
        case 'text':
          if (t.tokens) runs.push(...inlineToRuns(t.tokens, st, images, imageDims));
          else runs.push(...textToRuns(t.text, st));
          break;
        case 'strong':
          runs.push(...inlineToRuns(t.tokens, { ...st, bold: true }, images, imageDims));
          break;
        case 'em':
          runs.push(...inlineToRuns(t.tokens, { ...st, italics: true }, images, imageDims));
          break;
        case 'del':
          runs.push(...inlineToRuns(t.tokens, { ...st, strike: true }, images, imageDims));
          break;
        case 'codespan':
          runs.push(new docx.TextRun({ text: t.text, ...st, font: 'Consolas' }));
          break;
        case 'link': {
          const label = t.tokens ? inlineToRuns(t.tokens, { ...st, color: 'FF5310', underline: { type: 'single' } }, images, imageDims) : [new docx.TextRun({ text: t.text || t.href, ...st })];
          runs.push(...label);
          break;
        }
        case 'image': {
          const id = t.text || '';
          const dataUrl = images && images[id];
          if (dataUrl) {
            const ext = (id.split('.').pop() || 'jpeg').toLowerCase();
            runs.push(new docx.ImageRun({
              data: dataUrlToBytes(dataUrl),
              transformation: fitImageSize(imageDims && imageDims[id]),
              type: ext === 'png' ? 'png' : 'jpg',
            }));
          } else {
            runs.push(new docx.TextRun({ text: `[image : ${id || t.href}]`, ...st, italics: true, color: '6E6A5F' }));
          }
          break;
        }
        case 'br':
          runs.push(new docx.TextRun({ text: '', break: 1, ...st }));
          break;
        case 'escape':
          runs.push(new docx.TextRun({ text: t.text, ...st }));
          break;
        case 'html':
          runs.push(new docx.TextRun({ text: stripHtml(t.text), ...st }));
          break;
        default:
          if (t.raw) runs.push(new docx.TextRun({ text: t.raw, ...st }));
      }
    }
    return runs.length ? runs : [new docx.TextRun({ text: '', ...st })];
  }

  /* Convertit les tokens block marked en éléments docx (Paragraph / Table). */
  function blocksToElements(tokens, level, quote, images, imageDims) {
    const lv = level || 0;
    const quoteStyle = quote ? {
      indent: { left: 720 },
      border: { left: { color: 'FF5310', size: 12, style: docx.BorderStyle.SINGLE, space: 8 } },
    } : {};
    const els = [];
    for (const t of tokens || []) {
      switch (t.type) {
        case 'heading':
          els.push(new docx.Paragraph({
            heading: docx.HeadingLevel[HEADING_KEYS[Math.min(6, t.depth) - 1]],
            children: inlineToRuns(t.tokens, null, images, imageDims),
            ...quoteStyle,
          }));
          break;
        case 'paragraph':
          els.push(new docx.Paragraph({ children: inlineToRuns(t.tokens, null, images, imageDims), ...quoteStyle }));
          break;
        case 'list': {
          t.items.forEach((item, i) => {
            // aplati : texte inline de l'item + sous-listes éventuelles
            const inlineToks = [];
            const subBlocks = [];
            for (const it of item.tokens || []) {
              if (it.type === 'text' && it.tokens) inlineToks.push(...it.tokens);
              else if (it.type === 'text') inlineToks.push(it);
              else if (it.type === 'paragraph') inlineToks.push(...(it.tokens || []));
              else subBlocks.push(it);
            }
            const runs = inlineToRuns(inlineToks, null, images, imageDims);
            if (t.ordered) runs.unshift(new docx.TextRun({ text: `${i + 1}. `, bold: false }));
            els.push(new docx.Paragraph({
              children: runs,
              ...(t.ordered ? {} : { bullet: { level: Math.min(8, lv) } }),
              ...(lv > 0 ? { indent: { left: 720 * (lv + 1) } } : {}),
            }));
            if (subBlocks.length) els.push(...blocksToElements(subBlocks, lv + 1, false, images, imageDims));
          });
          break;
        }
        case 'table': {
          const cellToPar = (cell) => new docx.Paragraph({ children: inlineToRuns(cell.tokens, null, images, imageDims) });
          const rows = [];
          if (t.header && t.header.length) {
            rows.push(new docx.TableRow({
              tableHeader: true,
              children: t.header.map((c) => new docx.TableCell({ children: [cellToPar(c)] })),
            }));
          }
          for (const row of t.rows || []) {
            rows.push(new docx.TableRow({
              children: row.map((c) => new docx.TableCell({ children: [cellToPar(c)] })),
            }));
          }
          els.push(new docx.Table({
            width: { size: 100, type: docx.WidthType.PERCENTAGE },
            rows,
          }));
          break;
        }
        case 'code': {
          const lines = String(t.text || '').split('\n');
          const runs = [];
          lines.forEach((line, i) => {
            if (i > 0) runs.push(new docx.TextRun({ text: '', break: 1 }));
            runs.push(new docx.TextRun({ text: line || ' ', font: 'Consolas', size: 18 }));
          });
          els.push(new docx.Paragraph({ children: runs, spacing: { before: 120, after: 120 } }));
          break;
        }
        case 'blockquote':
          els.push(...blocksToElements(t.tokens, lv, true, images, imageDims));
          break;
        case 'hr':
          els.push(new docx.Paragraph({
            children: [],
            border: { bottom: { color: 'A8A294', size: 6, style: docx.BorderStyle.SINGLE, space: 1 } },
          }));
          break;
        case 'html':
          els.push(new docx.Paragraph({ children: [new docx.TextRun(stripHtml(t.text))] }));
          break;
        case 'space':
        default:
          break;
      }
    }
    return els;
  }

  function buildDocument(md, title, images, imageDims) {
    const tokens = marked.lexer(String(md || ''));
    return new docx.Document({
      creator: 'Lenancker Launcher — OCR Mistral',
      title: title || 'Document OCR',
      description: 'Texte extrait par OCR (mistral-ocr-latest) via le Lenancker Launcher.',
      sections: [{ children: blocksToElements(tokens, 0, false, images, imageDims) }],
    });
  }

  return {
    buildDocument,
    blocksToElements,
    inlineToRuns,
    fitImageSize,
    /* Navigateur : renvoie un Blob .docx prêt à télécharger. */
    async mdToDocxBlob(md, title, images, imageDims) {
      return docx.Packer.toBlob(buildDocument(md, title, images, imageDims));
    },
    /* Node (tests) : renvoie un Buffer. */
    async mdToDocxBuffer(md, title, images, imageDims) {
      return docx.Packer.toBuffer(buildDocument(md, title, images, imageDims));
    },
  };
});
