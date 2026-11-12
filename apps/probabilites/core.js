'use strict';
var ArbreCore = (function () {

  const MAX_LEVELS = 4;
  const MAX_BRANCHES = 4;
  const SERIF = "Georgia, 'Times New Roman', serif";

  // Constantes de mise en page (pixels)
  const GEO = {
    h: { dstep: 170, rowGap: 62,  inputW: 122, inputH: 30, padL: 48, padT: 80, padR: 34, padB: 30, rootR: 3.5, labOff: 13.5, gapIn: 16 },
    v: { dstep: 148, rowGapMin: 150, inputW: 104, inputH: 30, padL: 48, padT: 80, padR: 34, padB: 30, rootR: 3.5, labOff: 13.5, gapIn: 12 }
  };

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function depthOf(id) { return id.split('-').length - 1; }
  function parentOf(id) { const i = id.lastIndexOf('-'); return i < 0 ? null : id.slice(0, i); }
  const fn = v => (Math.round(v * 10) / 10).toString();

  function defaultState() {
    return {
      v: 1,
      experiment: '',
      orientation: 'h',
      notation: 'bar',
      showTotal: true,
      total: '',
      levels: [{ event: 'G', complement: '' }],
      choices: {},   // { idNœud : 'leaf' }  (absent = développé)
      branches: {},  // { idNœud : nombre de branches }  (absent = 2)
      labels: {},    // { idEnfant : nom saisi }  branche supplémentaire (index ≥ 2)
      probs: {},     // { idEnfant : texte saisi }  probabilité de la branche
      results: {}    // { idFeuille : texte saisi }  résultat du chemin
    };
  }

  // Nombre de branches partant d'un nœud (2 à MAX_BRANCHES, 2 par défaut)
  function branchCount(state, nid) {
    const v = parseInt(state && state.branches ? state.branches[nid] : null, 10);
    if (!v || v < 2) return 2;
    return Math.min(MAX_BRANCHES, v);
  }

  // Renseignements sur un nœud à partir de son identifiant (ex. 'R-0-1')
  function nodeInfo(state, nid) {
    if (nid === 'R') return { base: '', auto: false, comp: false, depth: 0 };
    const segs = nid.split('-');
    const depth = segs.length - 1;
    const s = Number(segs[segs.length - 1]);
    if (s >= 2) {
      const lbl = state.labels && state.labels[nid];
      return { base: lbl || '…', auto: false, comp: false, depth };
    }
    const lvl = (state.levels && state.levels[depth - 1]) || {};
    const base = s === 1 ? (lvl.complement || lvl.event || '…') : (lvl.event || '…');
    return { base, auto: (s === 1) && !lvl.complement, comp: s === 1, depth };
  }

  // Construction de l'arbre à partir de l'état
  function buildTree(state) {
    const levels = state.levels || [];
    const choices = state.choices || {};
    const root = { id: 'R', depth: 0, parent: null, childIX: 0, auto: false, base: '', children: [] };
    let frontier = [root];
    for (let d = 0; d < levels.length; d++) {
      const lvl = levels[d] || {};
      const next = [];
      for (const p of frontier) {
        if (d > 0 && choices[p.id] === 'leaf') continue; // nœud terminé en feuille
        const count = branchCount(state, p.id);
        for (let s = 0; s < count; s++) {
          const auto = (s === 1) && !lvl.complement;
          let base;
          if (s === 1 && lvl.complement) base = lvl.complement;
          else if (s >= 2) base = (state.labels && state.labels[p.id + '-' + s]) || '…';
          else base = lvl.event || '…';
          const node = {
            id: p.id + '-' + s, depth: d + 1, parent: p, childIX: s,
            auto, base, children: []
          };
          p.children.push(node);
          next.push(node);
        }
      }
      frontier = next;
    }
    return root;
  }

  // Mise en page « tidy tree » : feuilles sur des rangées régulières,
  // parents centrés sur leurs enfants, feuilles alignées à droite.
  function computeLayout(state) {
    const root = buildTree(state);

    let ord = 0;
    (function rec(n) {
      if (n.children.length) {
        for (const c of n.children) rec(c);
        n.row = (n.children[0].row + n.children[n.children.length - 1].row) / 2;
      } else {
        n.row = ord++;
      }
    })(root);

    const nodes = [];
    (function walk(n) { nodes.push(n); n.children.forEach(walk); })(root);
    const nodesByDepth = {};
    for (const n of nodes) (nodesByDepth[n.depth] = nodesByDepth[n.depth] || []).push(n);

    let alignDepth = 1;
    for (const n of nodes) if (n.depth > alignDepth) alignDepth = n.depth;

    for (const n of nodes) {
      if (n.id === 'R') { n.rx = GEO.h.rootR; n.ry = GEO.h.rootR; }
      else { n.rx = Math.max(24, 13 + n.base.length * 5.9); n.ry = 20; }
    }

    const leaves = nodes.filter(n => n.id !== 'R' && !n.children.length);
    let rxMax = 24;
    for (const lf of leaves) if (lf.rx > rxMax) rxMax = lf.rx;

    const vert = state.orientation === 'v';
    const geo = vert ? GEO.v : GEO.h;
    const rowGap = vert ? Math.max(geo.rowGapMin, 2 * rxMax + geo.inputW + 34) : geo.rowGap;

    for (const n of nodes) {
      const isLeaf = n.id !== 'R' && !n.children.length;
      const col = n.id === 'R' ? 0 : (isLeaf ? alignDepth : n.depth);
      if (vert) { n.x = geo.padL + n.row * rowGap; n.y = geo.padT + col * geo.dstep; }
      else      { n.x = geo.padL + col * geo.dstep; n.y = geo.padT + n.row * rowGap; }
    }

    // Arêtes : segment exactement entre les bords des ellipses
    const edges = [];
    for (const p of nodes) {
      for (const c of p.children) {
        const dx = c.x - p.x, dy = c.y - p.y, len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const s1 = 1 / Math.sqrt((ux / p.rx) * (ux / p.rx) + (uy / p.ry) * (uy / p.ry));
        const s2 = 1 / Math.sqrt((ux / c.rx) * (ux / c.rx) + (uy / c.ry) * (uy / c.ry));
        const x1 = p.x + ux * s1, y1 = p.y + uy * s1;
        const x2 = c.x - ux * s2, y2 = c.y - uy * s2;
        const prob = state.probs ? (state.probs[c.id] || '') : '';
        edges.push({ child: c.id, x1, y1, x2, y2, prob });
      }
    }
    // Étiquette de probabilité : milieu du segment, décalée au-dessus du trait
    for (const e of edges) {
      const ldx = e.x2 - e.x1, ldy = e.y2 - e.y1, l = Math.hypot(ldx, ldy) || 1;
      e.lx = (e.x1 + e.x2) / 2 + (ldy / l) * geo.labOff;
      e.ly = (e.y1 + e.y2) / 2 - (ldx / l) * geo.labOff;
    }

    // Cases de résultat, à droite de chaque feuille
    const inputs = [];
    for (const lf of leaves) {
      const off = vert ? (lf.rx + geo.gapIn) : (rxMax + geo.gapIn);
      inputs.push({
        nid: lf.id,
        x: Math.round(lf.x + off),
        y: Math.round(lf.y - geo.inputH / 2),
        w: geo.inputW, h: geo.inputH,
        value: state.results ? (state.results[lf.id] || '') : ''
      });
    }

    // Case « total des issues »
    let total = null;
    if (state.showTotal && leaves.length) {
      if (vert) {
        const last = leaves[leaves.length - 1];
        const x = Math.round(last.x + last.rx + geo.gapIn);
        total = {
          x, y: Math.round(last.y + 26), w: geo.inputW, h: geo.inputH,
          labelX: x - 10, labelAnchor: 'end',
          labelY: Math.round(last.y + 26 + geo.inputH / 2),
          value: state.total || ''
        };
      } else {
        const last = leaves[leaves.length - 1];
        const x = inputs.length ? inputs[0].x : Math.round(last.x + rxMax + geo.gapIn);
        total = {
          x, y: Math.round(last.y + 44), w: geo.inputW, h: geo.inputH,
          labelX: x - 10, labelAnchor: 'end',
          labelY: Math.round(last.y + 44 + geo.inputH / 2),
          value: state.total || ''
        };
      }
    }

    // Dimensions du dessin
    let W = 0, H = 0;
    if (vert) {
      let right = geo.padL;
      for (const i of inputs) right = Math.max(right, i.x + i.w);
      if (total) right = Math.max(right, total.x + total.w);
      W = Math.round(right + geo.padR);
      const bottomY = geo.padT + alignDepth * geo.dstep;
      H = Math.round(bottomY + (total ? (26 + geo.inputH + 14) : (20 + 10)) + geo.padB);
    } else {
      const right = inputs.length ? (inputs[0].x + geo.inputW) : (geo.padL + alignDepth * geo.dstep + rxMax);
      W = Math.round(right + geo.padR);
      const lastY = leaves.length ? leaves[leaves.length - 1].y : geo.padT;
      H = Math.round(lastY + (total ? (44 + geo.inputH + 14) : (15 + 10)) + geo.padB);
    }
    if (state.experiment) {
      W = Math.max(W, Math.round(44 + state.experiment.length * 8.6));
      H = Math.max(H, 150);
    }

    return {
      root, nodes, leaves, edges, inputs, total,
      fig: state.experiment || '',
      W, H, alignDepth, rowGap, nodesByDepth,
      notation: state.notation === 'hat' ? 'hat' : 'bar',
      vert
    };
  }

  // Contenu SVG (sans l'élément <svg> lui-même).
  // withResults : dessine aussi les cases de résultat et le total (export).
  function svgInner(L, withResults) {
    const e = escHtml;
    let s = '';
    s += '<rect x="0" y="0" width="' + L.W + '" height="' + L.H + '" fill="#ffffff"/>';
    if (L.fig) {
      s += '<text x="24" y="44" font-size="19" font-style="italic" fill="#000000">' + e(L.fig) + '</text>';
    }
    for (const ed of L.edges) {
      s += '<line x1="' + fn(ed.x1) + '" y1="' + fn(ed.y1) + '" x2="' + fn(ed.x2) + '" y2="' + fn(ed.y2) + '" stroke="#000000" stroke-width="1.3"/>';
      if (ed.prob) {
        s += '<text x="' + fn(ed.lx) + '" y="' + fn(ed.ly) + '" font-size="13.5" fill="#000000" text-anchor="middle" dominant-baseline="central">' + e(ed.prob) + '</text>';
      }
    }
    s += '<circle cx="' + fn(L.root.x) + '" cy="' + fn(L.root.y) + '" r="3.5" fill="#000000"/>';
    for (const n of L.nodes) {
      if (n.id === 'R') continue;
      s += '<ellipse cx="' + fn(n.x) + '" cy="' + fn(n.y) + '" rx="' + fn(n.rx) + '" ry="' + fn(n.ry) + '" fill="#ffffff" stroke="#000000" stroke-width="1.3"/>';
      s += '<text x="' + fn(n.x) + '" y="' + fn(n.y) + '" font-size="19" font-style="italic" fill="#000000" text-anchor="middle" dominant-baseline="central">' + e(n.base) + '</text>';
      if (n.auto) {
        const hw = Math.max(6, n.base.length * 3.2 + 1.2);
        if (L.notation === 'bar') {
          s += '<line x1="' + fn(n.x - hw) + '" y1="' + fn(n.y - 8.5) + '" x2="' + fn(n.x + hw) + '" y2="' + fn(n.y - 8.5) + '" stroke="#000000" stroke-width="1.5"/>';
        } else {
          s += '<path d="M ' + fn(n.x - hw) + ' ' + fn(n.y - 6) + ' L ' + fn(n.x) + ' ' + fn(n.y - 13.5) + ' L ' + fn(n.x + hw) + ' ' + fn(n.y - 6) + '" fill="none" stroke="#000000" stroke-width="1.4" stroke-linejoin="round"/>';
        }
      }
    }
    if (withResults) {
      for (const inp of L.inputs) {
        s += '<rect x="' + inp.x + '" y="' + inp.y + '" width="' + inp.w + '" height="' + inp.h + '" rx="4" fill="#ffffff" stroke="#000000" stroke-width="1.2"/>';
        if (inp.value) {
          s += '<text x="' + (inp.x + inp.w / 2) + '" y="' + (inp.y + inp.h / 2) + '" font-size="15" fill="#000000" text-anchor="middle" dominant-baseline="central">' + e(inp.value) + '</text>';
        }
      }
      const t = L.total;
      if (t) {
        s += '<rect x="' + t.x + '" y="' + t.y + '" width="' + t.w + '" height="' + t.h + '" rx="4" fill="#ffffff" stroke="#000000" stroke-width="1.2"/>';
        s += '<text x="' + t.labelX + '" y="' + t.labelY + '" font-size="15" font-style="italic" fill="#000000" text-anchor="' + t.labelAnchor + '" dominant-baseline="central">Total</text>';
        if (t.value) {
          s += '<text x="' + (t.x + t.w / 2) + '" y="' + (t.y + t.h / 2) + '" font-size="15" fill="#000000" text-anchor="middle" dominant-baseline="central">' + e(t.value) + '</text>';
        }
      }
    }
    return s;
  }

  // Document SVG complet autonome (export)
  function exportSvg(state) {
    const L = computeLayout(state);
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + L.W + '" height="' + L.H +
      '" viewBox="0 0 ' + L.W + ' ' + L.H + '" font-family="' + SERIF + '">' +
      svgInner(L, true) +
      '</svg>';
  }

  return {
    MAX_LEVELS, MAX_BRANCHES, escHtml, depthOf, parentOf, branchCount,
    defaultState, nodeInfo, computeLayout, svgInner, exportSvg
  };
})();
