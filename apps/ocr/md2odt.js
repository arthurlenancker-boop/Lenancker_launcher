/* md2odt.js — Convertit du Markdown (sortie OCR Mistral) en document LibreOffice Writer (.odt).
   Basé sur le lexer de marked (tokens), sans librairie externe : l'archive ODF
   (zip) est écrite à la main, entrées stockées sans compression.
   UMD : exposé en window.Md2Odt dans le navigateur, module.exports sous Node (tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root.marked);
  } else {
    root.Md2Odt = factory(root.marked);
  }
})(typeof self !== 'undefined' ? self : globalThis, function (marked) {
  'use strict';

  /* ---------- CRC32 (zip) ---------- */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* ---------- Écriture d'un zip (méthode « stocké », valide pour l'ODF) ---------- */
  function zipStore(files) {
    const enc = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    for (const f of files) {
      const nameBytes = enc.encode(f.name);
      const data = f.data;
      const crc = crc32(data);
      const local = new Uint8Array(30 + nameBytes.length);
      const dv = new DataView(local.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);        // version
      dv.setUint16(6, 0, true);         // flags
      dv.setUint16(8, 0, true);         // méthode : stocké
      dv.setUint32(14, crc, true);
      dv.setUint32(18, data.length, true);
      dv.setUint32(22, data.length, true);
      dv.setUint16(26, nameBytes.length, true);
      local.set(nameBytes, 30);
      chunks.push(local, data);

      const cen = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(cen.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint32(42, offset, true);
      cen.set(nameBytes, 46);
      central.push(cen);

      offset += local.length + data.length;
    }
    let centralSize = 0;
    for (const c of central) centralSize += c.length;
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, central.length, true);
    ev.setUint16(10, central.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    return new Blob([...chunks, ...central, end], { type: 'application/vnd.oasis.opendocument.text' });
  }

  /* ---------- XML helpers ---------- */
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

  /* Styles automatiques : combinaisons simples, réutilisées par nom. */
  const AUTO = {
    T:  { 'fo:font-weight': 'bold' },
    I:  { 'fo:font-style': 'italic' },
    C:  { 'style:font-name': 'Consolas', 'fo:font-size': '0.9em' },
    TI: { 'fo:font-weight': 'bold', 'fo:font-style': 'italic' },
    TC: { 'fo:font-weight': 'bold', 'style:font-name': 'Consolas' },
    IC: { 'fo:font-style': 'italic', 'style:font-name': 'Consolas' },
    Q:  { 'fo:color': '#666666', 'fo:font-style': 'italic' },
    L:  { 'fo:color': '#1155cc', 'style:text-underline-style': 'solid' },
  };
  function automaticStyles() {
    let s = '';
    for (const [name, props] of Object.entries(AUTO)) {
      s += `<style:style style:name="${name}" style:family="text"><style:text-properties`;
      for (const [k, v] of Object.entries(props)) s += ` ${k}="${esc(v)}"`;
      s += '/></style:style>';
    }
    return s;
  }

  /* Convertit un document base64 (data URL) en octets binaires. */
  function dataUrlBytes(dataUrl) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(String(dataUrl || ''));
    if (!m) return null;
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { mime: m[1], bytes };
  }

  /* ---------- Inline (tokens marked → ODF) ---------- */
  function inlineToOdf(tokens, images, ctx) {
    let out = '';
    for (const t of tokens || []) {
      switch (t.type) {
        case 'strong': out += `<text:span text:style-name="T">${inlineToOdf(t.tokens, images, ctx)}</text:span>`; break;
        case 'em':     out += `<text:span text:style-name="I">${inlineToOdf(t.tokens, images, ctx)}</text:span>`; break;
        case 'codespan': out += `<text:span text:style-name="C">${esc(t.text)}</text:span>`; break;
        case 'link':
          out += `<text:span text:style-name="L">${esc((t.tokens && t.tokens.length ? t.tokens.map((x) => x.text || '').join('') : t.text) || t.href)}</text:span>`;
          break;
        case 'br':     out += '<text:line-break/>'; break;
        case 'del':    out += `<text:span text:style-name="Q">${esc(t.text || '')}</text:span>`; break;
        case 'image': {
          const img = resolveImage(t.href, images, ctx);
          if (img) out += drawFrame(img, ctx, t.text);
          else out += esc(`[image : ${t.text || t.href}]`);
          break;
        }
        default: out += esc(t.text || '');
      }
    }
    return out;
  }

  /* Les figures de l'OCR arrivent en images[id] = data URL ; les autres
     href (http, /…) ne sont pas embarquées — l'aperçu les garde. */
  function resolveImage(href, images, ctx) {
    const id = String(href || '');
    if (images && images[id]) {
      const data = images[id];
      if (!ctx.seen.has(data)) {
        const decoded = dataUrlBytes(data);
        if (!decoded) return null;
        const n = ctx.pictures.push(decoded);
        ctx.seen.set(data, `Pictures/${ctx.imgBase}-${n}.${extOf(decoded.mime)}`);
      }
      return { name: ctx.seen.get(data), mime: dataUrlBytes(data).mime, bytes: dataUrlBytes(data).bytes };
    }
    return null;
  }
  function extOf(mime) {
    if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
    if (mime.includes('gif')) return 'gif';
    if (mime.includes('webp')) return 'webp';
    if (mime.includes('svg')) return 'svg';
    return 'png';
  }
  function drawFrame(img, ctx, alt) {
    return `<draw:frame text:anchor-type="as-char" svg:width="100%" draw:z-index="1">`
      + `<draw:image xlink:href="${esc(img.name)}" xlink:type="simple"/>`
      + `<svg:title>${esc(alt || '')}</svg:title></draw:frame>`;
  }

  /* ---------- Blocs (tokens marked → ODF) ---------- */
  /* Marqueur de page posé par ocr.js : « --- ### Page N » devient un vrai
     saut de page, le numéro reste visible en tête de la nouvelle page. */
  const PAGE_MARK_RE = /^page\s+\d+$/i;
  function prevNonSpace(toks, i) {
    for (let j = i - 1; j >= 0; j--) {
      if (toks[j].type !== 'space') return toks[j];
    }
    return null;
  }
  function nextNonSpace(toks, i) {
    for (let j = i + 1; j < toks.length; j++) {
      if (toks[j].type !== 'space') return toks[j];
    }
    return null;
  }
  function isPageMarkHeading(t, prev) {
    return t && t.type === 'heading' && t.depth === 3 && PAGE_MARK_RE.test(String(t.text || '').trim())
      && prev && prev.type === 'hr';
  }
  function blocksToOdf(tokens, images, ctx, depth) {
    let out = '';
    const toks = tokens || [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      const prev = prevNonSpace(toks, i);
      const next = nextNonSpace(toks, i);
      switch (t.type) {
        case 'heading': {
          if (isPageMarkHeading(t, prev)) {
            out += `<text:p text:style-name="PageMark">${esc(t.text)}</text:p>`;
            break;
          }
          const lvl = Math.min(6, t.depth);
          out += `<text:h text:outline-level="${lvl}">${inlineToOdf(t.tokens, images, ctx)}</text:h>`;
          break;
        }
        case 'paragraph':
          out += `<text:p>${inlineToOdf(t.tokens, images, ctx)}</text:p>`;
          break;
        case 'blockquote':
          out += `<text:p text:style-name="Quote">${inlineToOdf(t.tokens, images, ctx)}</text:p>`;
          break;
        case 'code': {
          const lines = String(t.text || '').split('\n');
          out += lines.map((l) => `<text:p text:style-name="Preformatted">${esc(l) || ' '}</text:p>`).join('');
          break;
        }
        case 'hr':
          if (isPageMarkHeading(next, t)) break; // le saut de page remplace le trait
          out += '<text:p text:style-name="HR"/>';
          break;
        case 'list': {
          const tag = t.ordered ? 'text:list text:style-name="LNum"' : 'text:list text:style-name="LBul"';
          const items = (t.items || []).map((it) =>
            `<text:list-item>${blocksToOdf(it.tokens, images, ctx, depth + 1)}</text:list-item>`).join('');
          out += `<${tag}>${items}</text:list>`;
          break;
        }
        case 'table': {
          let tbl = '<table:table>';
          tbl += `<table:table-column table:number-columns-repeated="${Math.max(1, (t.header || []).length)}"/>`;
          tbl += '<table:table-header-rows><table:table-row>';
          for (const c of t.header || []) {
            tbl += `<table:table-cell office:value-type="string"><text:p text:style-name="TH">${inlineToOdf(c.tokens, images, ctx)}</text:p></table:table-cell>`;
          }
          tbl += '</table:table-row></table:table-header-rows>';
          for (const row of t.rows || []) {
            tbl += '<table:table-row>';
            for (const c of row) {
              tbl += `<table:table-cell office:value-type="string"><text:p>${inlineToOdf(c.tokens, images, ctx)}</text:p></table:table-cell>`;
            }
            tbl += '</table:table-row>';
          }
          out += tbl + '</table:table>';
          break;
        }
        case 'space': break;
        case 'html':
          if (t.text) out += `<text:p>${esc(t.text)}</text:p>`;
          break;
        default:
          if (t.text) out += `<text:p>${esc(t.text)}</text:p>`;
      }
    }
    return out;
  }

  /* ---------- Document ---------- */
  function buildOdt(md, title, images) {
    const ctx = { pictures: [], seen: new Map(), imgBase: 'img' };
    const tokens = marked.lexer(String(md || ''));
    const body = blocksToOdf(tokens, images || {}, ctx, 0);

    const content =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<office:document-content ' +
      'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
      'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ' +
      'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" ' +
      'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" ' +
      'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" ' +
      'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" ' +
      'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" ' +
      'xmlns:xlink="http://www.w3.org/1999/xlink" ' +
      'office:version="1.2">' +
      '<office:automatic-styles>' + automaticStyles() +
      '<style:style style:name="Quote" style:family="paragraph"><style:paragraph-properties fo:margin-left="1cm"/><style:text-properties fo:color="#666666" fo:font-style="italic"/></style:style>' +
      '<style:style style:name="Preformatted" style:family="paragraph"><style:text-properties style:font-name="Consolas" fo:font-size="9pt"/></style:style>' +
      '<style:style style:name="TH" style:family="paragraph"><style:text-properties fo:font-weight="bold"/></style:style>' +
      '<style:style style:name="HR" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:border-bottom="0.5pt solid #999999" fo:padding-bottom="0.1cm"/></style:style>' +
      '<style:style style:name="PageMark" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:break-before="page" fo:margin-bottom="0.3cm"/><style:text-properties fo:font-weight="bold" fo:color="#666666" fo:font-size="10pt"/></style:style>' +
      '</office:automatic-styles>' +
      '<office:body><office:text>' +
      (title ? `<text:h text:outline-level="1">${esc(title)}</text:h>` : '') +
      body +
      '</office:text></office:body></office:document-content>';

    const styles =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
      'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" ' +
      'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" ' +
      'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ' +
      'xmlns:list="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2">' +
      '<office:styles>' +
      '<style:style style:name="Standard" style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.2cm"/></style:style>' +
      '<text:list-style style:name="LNum">' +
      Array.from({ length: 6 }, (_, i) =>
        `<text:list-level-style-number text:level="${i + 1}" style:num-format="1" text:list-level-position-in-list="0">` +
        '<style:list-level-properties text:list-level-position-space="1cm"/>' +
        '<style:text-properties/></text:list-level-style-number>').join('') +
      '</text:list-style>' +
      '<text:list-style style:name="LBul">' +
      Array.from({ length: 6 }, (_, i) =>
        `<text:list-level-style-bullet text:level="${i + 1}" text:bullet-char="•">` +
        '<style:list-level-properties text:list-level-position-space="1cm"/>' +
        '<style:text-properties/></text:list-level-style-bullet>').join('') +
      '</text:list-style>' +
      '</office:styles></office:document-styles>';

    const manifestPics = ctx.pictures.map((p, i) =>
      `<manifest:file-entry manifest:full-path="Pictures/${ctx.imgBase}-${i + 1}.${extOf(p.mime)}" manifest:media-type="${esc(p.mime)}"/>`).join('');
    const manifest =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">' +
      '<manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.text"/>' +
      '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>' +
      '<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>' +
      manifestPics +
      '</manifest:manifest>';

    const enc = new TextEncoder();
    const files = [
      { name: 'mimetype', data: enc.encode('application/vnd.oasis.opendocument.text') },
      { name: 'content.xml', data: enc.encode(content) },
      { name: 'styles.xml', data: enc.encode(styles) },
      { name: 'META-INF/manifest.xml', data: enc.encode(manifest) },
    ];
    ctx.pictures.forEach((p, i) => {
      files.push({ name: `Pictures/${ctx.imgBase}-${i + 1}.${extOf(p.mime)}`, data: p.bytes });
    });
    return zipStore(files);
  }

  return {
    /* Navigateur : renvoie un Blob .odt prêt à télécharger. */
    async mdToOdtBlob(md, title, images) {
      return buildOdt(md, title, images);
    },
    /* Tests Node : renvoie le buffer zip. */
    async mdToOdtBuffer(md, title, images) {
      return new Uint8Array(await buildOdt(md, title, images).arrayBuffer());
    },
  };
});
