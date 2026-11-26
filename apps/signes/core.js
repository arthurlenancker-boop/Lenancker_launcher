/* core.js — Moteur du tableau de signes : analyse de f(x) (normalisation,
   parseur, développement polynomial exact en rationnels BigInt, racines),
   construction du tableau (bornes, signes, marqueurs) et mise en page SVG,
   découplé du DOM pour être testable sous Node (même convention UMD que
   ArbreCore/FocusCore).

   Conventions du tableau (style manuel de maths) :
   - un facteur par ligne, la fonction sur la dernière ligne ;
   - quand un facteur (ou f) s'annule en une valeur, un 0 est posé SUR la
     barre verticale de cette valeur : la barre coupe le 0 en son milieu
     (rendu : ellipse au trait, centre évidé, la ligne passe à travers) ;
   - quand le dénominateur s'annule (valeur interdite), la barre verticale
     entière est doublée (double barre) sur toute la hauteur du tableau. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SignesCore = factory();
})(typeof self !== 'undefined' ? self : globalThis, function () {
'use strict';
return (function () {

  const SERIF = "Georgia, 'Times New Roman', serif";
  const MAX_EXP = 6;    // exposant entier admissible
  const MAX_DEG = 8;    // degré max d'un facteur après développement
  const MAX_ROOTS = 24; // garde-fou : racines numériques d'un même facteur

  function err(msg) { const e = new Error(msg); e.userError = true; return e; }

  /* ---------------- rationnels exacts (BigInt) ---------------- */

  function absB(a) { return a < 0n ? -a : a; }
  function gcdB(a, b) { a = absB(a); b = absB(b); while (b) { const t = a % b; a = b; b = t; } return a; }
  function rat(n, d) {
    if (d === undefined) d = 1n;
    if (d === 0n) throw err('Division par zéro.');
    if (d < 0n) { n = -n; d = -d; }
    const g = gcdB(n, d) || 1n;
    return { n: n / g, d: d / g };
  }
  const R0 = rat(0n);
  const R1 = rat(1n);
  const rAdd = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
  const rSub = (a, b) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
  const rMul = (a, b) => rat(a.n * b.n, a.d * b.d);
  const rNeg = a => ({ n: -a.n, d: a.d });
  const rCmp = (a, b) => { const l = a.n * b.d, r = b.n * a.d; return l < r ? -1 : l > r ? 1 : 0; };
  const numOf = a => Number(a.n) / Number(a.d);
  const absR = r => (r.n < 0n ? rNeg(r) : r);

  /* ---------------- polynômes { c: [rat] } (indice = degré) ---------------- */

  function pTrim(c) { let i = c.length - 1; while (i >= 0 && c[i].n === 0n) i--; return c.slice(0, i + 1); }
  const pZero = { c: [] };
  function pConst(r) { return r.n === 0n ? pZero : { c: [r] }; }
  const pDeg = p => p.c.length - 1;
  function pAdd(a, b) {
    const c = [];
    for (let i = 0; i < Math.max(a.c.length, b.c.length); i++) c.push(rAdd(a.c[i] || R0, b.c[i] || R0));
    return { c: pTrim(c) };
  }
  function pSub(a, b) {
    const c = [];
    for (let i = 0; i < Math.max(a.c.length, b.c.length); i++) c.push(rSub(a.c[i] || R0, b.c[i] || R0));
    return { c: pTrim(c) };
  }
  function pMul(a, b) {
    if (!a.c.length || !b.c.length) return pZero;
    const c = new Array(a.c.length + b.c.length - 1).fill(R0);
    for (let i = 0; i < a.c.length; i++)
      for (let j = 0; j < b.c.length; j++)
        c[i + j] = rAdd(c[i + j], rMul(a.c[i], b.c[j]));
    return { c: pTrim(c) };
  }
  function pPow(a, e) { let r = pConst(R1); for (let i = 0; i < e; i++) r = pMul(r, a); return r; }
  function pEvalR(p, x) { let s = R0; for (let i = p.c.length - 1; i >= 0; i--) s = rAdd(rMul(s, x), p.c[i]); return s; }
  function pEvalF(p, x) { let s = 0; for (let i = p.c.length - 1; i >= 0; i--) s = s * x + numOf(p.c[i]); return s; }
  function pDivLin(p, r) { // division exacte par (x - r)
    const deg = pDeg(p);
    const out = new Array(deg).fill(R0);
    let carry = R0;
    for (let i = deg; i >= 1; i--) out[i - 1] = carry = rAdd(p.c[i], rMul(carry, r));
    return { c: pTrim(out) };
  }

  /* ---------------- normalisation + tokenisation ---------------- */

  const SUP_DIGITS = { '0': '\u2070', '1': '\u00b9', '2': '\u00b2', '3': '\u00b3', '4': '\u2074', '5': '\u2075', '6': '\u2076', '7': '\u2077', '8': '\u2078', '9': '\u2079' };
  function sup(d) { return String(d).split('').map(c => SUP_DIGITS[c] || c).join(''); }

  function normalize(src) {
    let s = String(src == null ? '' : src);
    s = s.trim().toLowerCase()
      .replace(/[\u2212\u2013\u2014]/g, '-')          // moins, tiret demi/cadratin
      .replace(/[\u00d7\u00b7]/g, '*')               // × ·
      .replace(/\u00f7/g, '/')                        // ÷
      .replace(/[\u00b2\u00b3\u2074\u2075\u2076\u2077\u2078\u2079]/g, (m) => {
        return { '\u00b2': '^2', '\u00b3': '^3', '\u2074': '^4', '\u2075': '^5', '\u2076': '^6', '\u2077': '^7', '\u2078': '^8', '\u2079': '^9' }[m];
      })
      .replace(/(\d),(\d)/g, '$1.$2')                 // virgule décimale française
      .replace(/\s+/g, '');
    s = s.replace(/^[fy](\(?x\)?)?=/, '');         // « f(x) = » ou « y = » facultatif
    return s;
  }

  function numToRat(raw) {
    const i = raw.indexOf('.');
    if (i < 0) return rat(BigInt(raw), 1n);
    const int = raw.slice(0, i) || '0';
    const frac = raw.slice(i + 1);
    return rat(BigInt(int + frac), 10n ** BigInt(frac.length));
  }

  function tokenize(s) {
    const T = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if ((ch >= '0' && ch <= '9') || ch === '.') {
        let j = i;
        while (j < s.length && ((s[j] >= '0' && s[j] <= '9') || s[j] === '.')) j++;
        const raw = s.slice(i, j);
        if (!/^\d+(\.\d+)?$/.test(raw)) throw err('Je ne comprends pas le nombre \u00ab ' + raw + ' \u00bb.');
        T.push({ t: 'num', raw: raw, s: i, e: j });
        i = j;
        continue;
      }
      if (ch === 'x') { T.push({ t: 'var', s: i, e: i + 1 }); i++; continue; }
      if (ch === '+' || ch === '-' || ch === '*' || ch === '/') { T.push({ t: 'op', v: ch, s: i, e: i + 1 }); i++; continue; }
      if (ch === '^') { T.push({ t: 'pow', s: i, e: i + 1 }); i++; continue; }
      if (ch === '(') { T.push({ t: 'lp', s: i, e: i + 1 }); i++; continue; }
      if (ch === ')') { T.push({ t: 'rp', s: i, e: i + 1 }); i++; continue; }
      throw err('Je ne comprends pas \u00ab ' + ch + ' \u00bb : seuls x, les chiffres et + \u2212 \u00d7 \u00f7 / ( ) ^ sont acceptés.');
    }
    // multiplication implicite : 2x, 3(x-1), (x-1)(x+2), 2)( …
    const out = [];
    for (const tk of T) {
      const prev = out[out.length - 1];
      if (prev && (prev.t === 'num' || prev.t === 'var' || prev.t === 'rp') &&
          (tk.t === 'num' || tk.t === 'var' || tk.t === 'lp')) {
        out.push({ t: 'op', v: '*', s: tk.s, e: tk.s });
      }
      out.push(tk);
    }
    return out;
  }

  /* ---------------- parseur (récursif descendant) ---------------- */

  function parse(src) {
    const s = normalize(src);
    if (!s) throw err('Écris d\u2019abord une fonction, par exemple (2x-1)(x+3)/(x-2).');
    const T = tokenize(s);
    let pos = 0;
    const peek = () => T[pos];

    function parseExpr() {
      let n = parseTerm();
      while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
        const op = T[pos++];
        const r = parseTerm();
        n = { k: op.v, a: n, b: r, s: n.s, e: r.e };
      }
      return n;
    }
    function parseTerm() {
      let sgn = null, s0 = null;
      const t0 = peek();
      if (t0 && t0.t === 'op' && (t0.v === '-' || t0.v === '+')) { pos++; sgn = t0.v; s0 = t0.s; }
      let n = parsePow();
      while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/')) {
        const op = T[pos++];
        const r = parseUnary();
        n = { k: op.v, a: n, b: r, s: n.s, e: r.e };
      }
      if (sgn === '-') n = { k: 'neg', a: n, b: null, s: s0, e: n.e };
      return n;
    }
    function parseUnary() {
      const t = peek();
      if (t && t.t === 'op' && (t.v === '-' || t.v === '+')) {
        pos++;
        const inner = parseUnary();
        if (t.v === '+') return inner;
        return { k: 'neg', a: inner, b: null, s: t.s, e: inner.e };
      }
      return parsePow();
    }
    function parsePow() {
      const a = parseAtom();
      if (peek() && peek().t === 'pow') {
        pos++;
        let sign = 1;
        const sn = peek();
        if (sn && sn.t === 'op' && (sn.v === '-' || sn.v === '+')) {
          if (sn.v === '-') sign = -1;
          pos++;
        }
        const nt = peek();
        if (!nt || nt.t !== 'num' || !/^\d+$/.test(nt.raw)) throw err('L\u2019exposant doit être un nombre entier (ex. ^2).');
        pos++;
        const v = sign * parseInt(nt.raw, 10);
        if (v > MAX_EXP || v < -MAX_EXP) throw err('L\u2019exposant ' + v + ' est trop grand (maximum ' + MAX_EXP + ').');
        return { k: 'pow', a: a, b: v, s: a.s, e: nt.e };
      }
      return a;
    }
    function parseAtom() {
      const t = peek();
      if (!t) throw err('Expression incomplète.');
      if (t.t === 'num') { pos++; return { k: 'num', a: numToRat(t.raw), b: null, s: t.s, e: t.e }; }
      if (t.t === 'var') { pos++; return { k: 'var', a: null, b: null, s: t.s, e: t.e }; }
      if (t.t === 'lp') {
        pos++;
        const inner = parseExpr();
        const r = peek();
        if (!r || r.t !== 'rp') throw err('Parenthèse fermante manquante.');
        pos++;
        return { k: inner.k, a: inner.a, b: inner.b, s: t.s, e: r.e };
      }
      if (t.t === 'rp') throw err('Parenthèse fermante inattendue.');
      throw err('Je ne comprends pas la fin de l\u2019expression.');
    }

    const root = parseExpr();
    if (pos < T.length) {
      const t = T[pos];
      if (t.t === 'rp') throw err('Parenthèse fermante inattendue.');
      throw err('Je ne comprends pas \u00ab ' + s.slice(t.s, t.e) + ' \u00bb ici.');
    }
    return { src: s, ast: root };
  }

  /* ---------------- développement polynomial ---------------- */

  function toPoly(n) {
    switch (n.k) {
      case 'num': return pConst(n.a);
      case 'var': return { c: [R0, R1] };
      case 'neg': return pSub(pZero, toPoly(n.a));
      case '+': return pAdd(toPoly(n.a), toPoly(n.b));
      case '-': return pSub(toPoly(n.a), toPoly(n.b));
      case '*': return pMul(toPoly(n.a), toPoly(n.b));
      case 'pow': return pPow(toPoly(n.a), n.b);
      case '/': {
        const e2 = err('Cette partie contient une division imbriquée : je sais traiter les quotients au niveau global (ex. (x-1)(x+2)/(x-3)) ; simplifie ou développe d\u2019abord.');
        e2.fallback = true;
        throw e2;
      }
      default: throw err('Expression non supportée.');
    }
  }

  /* ---------------- structure produit / quotient ---------------- */

  function collectFactors(ast, src) {
    const out = [];
    (function walk(n, den) {
      if (n.k === '*') { walk(n.a, den); walk(n.b, den); return; }
      if (n.k === '/') { walk(n.a, den); walk(n.b, !den); return; }
      if (n.k === 'pow' && n.b < 0) {
        // (x-1)^-2 = 1/(x-1)² : facteur au dénominateur
        out.push({ node: { k: 'pow', a: n.a, b: -n.b, s: n.s, e: n.e }, den: !den, raw: src.slice(n.s, n.e) });
        return;
      }
      out.push({ node: n, den: den, raw: src.slice(n.s, n.e) });
    })(ast, false);
    return out;
  }

  /* ---------------- racines ---------------- */

  function divisorsB(m) { // m > 0
    const ds = [];
    for (let i = 1n; i * i <= m; i++) {
      if (m % i === 0n) { ds.push(i); const q = m / i; if (q !== i) ds.push(q); }
    }
    return ds;
  }

  // Met un polynôme à coefficients rationnels à coefficients entiers (mêmes
  // racines, mêmes signes) : le théorème des racines rationnelles
  // (p divise a0, q divise le coefficient dominant) exige des entiers.
  function lcmB(a, b) { const g = gcdB(a, b); return g === 0n ? 0n : (a / g) * b; }
  function pScaleInt(p) {
    let L = 1n;
    for (const c of p.c) L = lcmB(L, c.d);
    return { c: pTrim(p.c.map(c => rat(c.n * (L / c.d), 1n))) };
  }

  function findOneRational(p) {
    const deg = pDeg(p);
    if (deg < 1) return null;
    const sc = pScaleInt(p);
    const a0 = sc.c[0], an = sc.c[deg];
    if (a0.n === 0n) return R0; // racine évidente 0
    if (absB(a0.n) > 1000000000n || absB(an.n) > 1000000000n) return null; // trop gros : repli numérique
    const cands = [];
    for (const pp of divisorsB(absB(a0.n)))
      for (const qq of divisorsB(absB(an.n)))
        for (const sg of [1n, -1n]) {
          const c = rat(pp * sg, qq);
          if (pEvalR(p, c).n === 0n) cands.push(c);
        }
    if (!cands.length) return null;
    cands.sort((u, v) => {
      const d = rCmp(absR(u), absR(v));
      return d !== 0 ? d : rCmp(u, v);
    });
    return cands[0];
  }

  function rationalRoots(p) {
    let q = { c: p.c.slice() };
    const roots = [];
    while (pDeg(q) >= 1) {
      const r = findOneRational(q);
      if (!r) break;
      roots.push(r);
      q = pDivLin(q, r);
    }
    return { roots: roots, rest: q };
  }

  function numericRoots(p) {
    const f = x => pEvalF(p, x);
    const found = [];
    let prevX = -200, prevY = f(prevX);
    const push = v => {
      for (const u of found) if (Math.abs(u - v) < 1e-6) return;
      found.push(v);
      if (found.length > MAX_ROOTS) throw err('Trop de racines à tracer dans un seul tableau.');
    };
    if (prevY === 0) push(prevX);
    for (let x = -200 + 0.02; x <= 200.0001; x += 0.02) {
      const y = f(x);
      if (y === 0) { push(x); }
      else if ((prevY < 0) !== (y < 0)) {
        let a = prevX, b = x, fa = prevY;
        for (let k = 0; k < 60; k++) {
          const m = (a + b) / 2;
          const fm = f(m);
          if ((fa < 0) !== (fm < 0)) b = m; else { a = m; fa = fm; }
        }
        push((a + b) / 2);
      }
      prevX = x; prevY = y;
    }
    return found;
  }

  function rootsOf(p) { // [{ val: rat | nombre, approx: bool }]
    if (pDeg(p) < 1) return [];
    const r = rationalRoots(p);
    const out = r.roots.map(v => ({ val: v, approx: false }));
    const rd = pDeg(r.rest);
    if (rd === 2) {
      const a = r.rest.c[2], b = r.rest.c[1], c = r.rest.c[0];
      const delta = rSub(rMul(b, b), rMul(rMul(rat(4n), a), c));
      if (delta.n > 0n) {
        const A = numOf(a), B = numOf(b), D = Math.sqrt(numOf(delta));
        out.push({ val: (-B + D) / (2 * A), approx: true });
        out.push({ val: (-B - D) / (2 * A), approx: true });
      } // delta <= 0 : pas de racine réelle, signe constant
    } else if (rd >= 3) {
      for (const v of numericRoots(r.rest)) out.push({ val: v, approx: true });
    }
    return out;
  }

  /* ---------------- étiquettes ---------------- */

  function fmtRat(r) { return r.d === 1n ? r.n.toString() : r.n.toString() + '/' + r.d.toString(); }
  function fmtApprox(x) {
    const v = Math.round(x * 100) / 100;
    return '\u2248 ' + String(v).replace('.', ',');
  }
  function wrapsAll(s) { // "(x-1)" oui, "(x-1)(x+2)" non
    let d = 0;
    for (let i = 0; i < s.length - 1; i++) {
      if (s[i] === '(') d++;
      else if (s[i] === ')') { d--; if (d === 0) return false; }
    }
    return true;
  }
  function prettyLabel(raw) {
    let s = raw;
    while (s.length > 1 && s[0] === '(' && s[s.length - 1] === ')' && wrapsAll(s)) s = s.slice(1, -1);
    return s.replace(/\^(\d+)/g, (m, d) => sup(d)).replace(/(\d)\.(\d)/g, '$1,$2').replace(/\*/g, '\u00b7');
  }

  /* ---------------- repli : fraction rationnelle réduite ---------------- */

  // Évalue l'expression comme fraction rationnelle N/D (sommes de quotients
  // comprises : 1/(x-1)+2 se réduit en (2x-1)/(x-1)).
  function evalRF(n) {
    switch (n.k) {
      case 'num': return { n: pConst(n.a), d: pConst(R1) };
      case 'var': return { n: { c: [R0, R1] }, d: pConst(R1) };
      case 'neg': { const r = evalRF(n.a); return { n: pSub(pZero, r.n), d: r.d }; }
      case '+': { const a = evalRF(n.a), b = evalRF(n.b);
        return { n: pAdd(pMul(a.n, b.d), pMul(b.n, a.d)), d: pMul(a.d, b.d) }; }
      case '-': { const a = evalRF(n.a), b = evalRF(n.b);
        return { n: pSub(pMul(a.n, b.d), pMul(b.n, a.d)), d: pMul(a.d, b.d) }; }
      case '*': { const a = evalRF(n.a), b = evalRF(n.b);
        return { n: pMul(a.n, b.n), d: pMul(a.d, b.d) }; }
      case '/': { const a = evalRF(n.a), b = evalRF(n.b);
        if (pDeg(b.n) < 0) throw err('Division par zéro : le d\u00e9nominateur vaut 0 partout.');
        return { n: pMul(a.n, b.d), d: pMul(a.d, b.n) }; }
      case 'pow': {
        const base = evalRF(n.a);
        const e = Math.abs(n.b);
        if (n.b < 0 && pDeg(base.n) < 0) throw err('Division par zéro : la base de la puissance négative vaut 0 partout.');
        const pn = pPow(base.n, e), pd = pPow(base.d, e);
        return n.b >= 0 ? { n: pn, d: pd } : { n: pd, d: pn };
      }
      default: throw err('Expression non supportée.');
    }
  }

  // Factorise P en facteurs affines (racines rationnelles regroupées par
  // multiplicité) + résidu ; renvoie des lignes { label, den, poly } et
  // met à jour le signe global via les constantes résiduelles.
  function factorRows(P, den, csignRef) {
    const rows = [];
    let q = { c: P.c.slice() };
    const groups = []; // { r, m }
    while (pDeg(q) >= 1) {
      const r = findOneRational(q);
      if (!r) break;
      const last = groups[groups.length - 1];
      if (last && rCmp(last.r, r) === 0) last.m++;
      else groups.push({ r: r, m: 1 });
      q = pDivLin(q, r);
    }
    groups.sort((a, b) => rCmp(a.r, b.r));
    for (const g of groups) {
      // racine r = n/d -> facteur dx - n
      const c0 = -g.r.n; // constante du facteur dx - n
      let cst;
      if (c0 < 0n) cst = c0.toString();
      else if (c0 > 0n) cst = '+' + c0.toString();
      else cst = '';
      let lb = (g.r.d === 1n ? 'x' : g.r.d.toString() + 'x') + cst;
      if (g.m > 1) lb += sup(g.m);
      rows.push({ label: lb, den: den, poly: pPow(linPoly(g.r), g.m) });
    }
    const rd = pDeg(q);
    if (rd === 0) csignRef.v *= q.c[0].n < 0n ? -1 : 1; // constante résiduelle
    else if (rd >= 1) rows.push({ label: formatPoly(q), den: den, poly: q });
    return rows;
  }
  function linPoly(r) { return { c: [rNeg(r), R1] }; } // x - r

  function formatPoly(P) {
    const deg = pDeg(P);
    const parts = [];
    for (let i = deg; i >= 0; i--) {
      const c = P.c[i];
      if (c.n === 0n) continue;
      let co = fmtRat(c);
      const neg = co[0] === '-';
      if (neg) co = co.slice(1);
      let t;
      if (i === 0) t = co;
      else {
        const xp = i === 1 ? 'x' : 'x' + sup(i);
        if (c.n === 1n && c.d === 1n) t = xp;
        else if (c.d !== 1n) t = '(' + co + ')' + xp;
        else t = co + xp;
      }
      parts.push((neg ? '-' : (parts.length ? '+' : '')) + t);
    }
    return parts.join('') || '0';
  }

  /* ---------------- analyse : le tableau complet ---------------- */

  const valOf = r => (r.approx ? r.val : numOf(r.val));
  const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

  // Lignes telles que saisies (structure produit/quotient conservée).
  function rowsAsTyped(parsed) {
    const factors = collectFactors(parsed.ast, parsed.src);
    const csign = { v: 1 };
    let identZero = false;
    const polys = [];
    for (const f of factors) {
      const p = toPoly(f.node);
      const deg = pDeg(p);
      if (deg > MAX_DEG) throw err('Degr\u00e9 trop \u00e9lev\u00e9 apr\u00e8s d\u00e9veloppement (maximum ' + MAX_DEG + ').');
      if (deg < 0) { identZero = true; continue; }        // facteur nul : f identiquement nulle
      if (deg === 0) { if (p.c[0].n < 0n) csign.v *= -1; continue; } // constante : signe global
      polys.push({ label: prettyLabel(f.raw), den: f.den, poly: p });
    }
    return { polys: polys, csign: csign, identZero: identZero };
  }

  function analyze(src) {
    let parsed;
    try { parsed = parse(src); }
    catch (e) { return { ok: false, error: e.message }; }

    let built;
    try { built = rowsAsTyped(parsed); }
    catch (e) {
      if (!e.fallback) return { ok: false, error: e.message };
      // Somme contenant un quotient : réduction en fraction rationnelle,
      // puis factorisation des numérateur et dénominateur en lignes.
      let rf;
      try { rf = evalRF(parsed.ast); }
      catch (e2) { return { ok: false, error: e2.message }; }
      built = { polys: [], csign: { v: 1 }, identZero: false };
      if (pDeg(rf.n) < 0) return { ok: false, error: 'f(x) vaut 0 partout : il n\u2019y a pas de tableau de signes \u00e0 tracer.' };
      if (pDeg(rf.d) < 0) {
        if (pDeg(rf.n) === 0) { built.csign.v *= rf.n.c[0].n < 0n ? -1 : 1; } // constante
        else built.polys = built.polys.concat(factorRows(rf.n, false, built.csign));
      } else {
        if (pDeg(rf.n) === 0 && rf.n.c[0].n !== 0n) built.csign.v *= rf.n.c[0].n < 0n ? -1 : 1;
        else if (pDeg(rf.n) >= 1) built.polys = built.polys.concat(factorRows(rf.n, false, built.csign));
        built.polys = built.polys.concat(factorRows(rf.d, true, built.csign));
      }
    }
    const polys = built.polys, csign = built.csign.v;
    if (built.identZero) return { ok: false, error: 'f(x) vaut 0 partout : il n\u2019y a pas de tableau de signes \u00e0 tracer.' };

    let rootLists;
    try { rootLists = polys.map(fr => rootsOf(fr.poly)); }
    catch (e) { return { ok: false, error: e.message }; }

    // bornes : toutes les racines, distinctes, triées ; interdite l'emporte sur zéro
    const flat = [];
    polys.forEach((fr, i) => rootLists[i].forEach(r => flat.push({ i: i, root: r })));
    flat.sort((A, B) => valOf(A.root) - valOf(B.root));
    const bounds = [];
    for (const it of flat) {
      const v = valOf(it.root);
      const last = bounds[bounds.length - 1];
      if (last && near(last.v, v)) {
        if (polys[it.i].den) last.denZero = true; else last.numZero = true;
        continue;
      }
      bounds.push({ v: v, approx: it.root.approx, rat: it.root.approx ? null : it.root.val,
                    numZero: !polys[it.i].den, denZero: !!polys[it.i].den });
    }
    for (const b of bounds) b.label = b.approx ? fmtApprox(b.v) : fmtRat(b.rat);

    // points de sondage par intervalle (exacts tant que les bornes sont exactes)
    const nB = bounds.length, nI = nB + 1;
    const maxStep = v => {
      const half = rMul(absR(v), rat(1n, 2n));
      return rCmp(half, R1) >= 0 ? half : R1; // |v|/2, au moins 1
    };
    const samples = [];
    for (let i = 0; i < nI; i++) {
      const lo = i === 0 ? null : bounds[i - 1], hi = i === nB ? null : bounds[i];
      const exact = (lo === null || !lo.approx) && (hi === null || !hi.approx);
      if (exact) {
        const loR = lo === null ? null : lo.rat, hiR = hi === null ? null : hi.rat;
        if (loR === null && hiR === null) samples.push({ exact: true, r: R0 });
        else if (loR === null) samples.push({ exact: true, r: rSub(hiR, maxStep(hiR)) });
        else if (hiR === null) samples.push({ exact: true, r: rAdd(loR, maxStep(loR)) });
        else samples.push({ exact: true, r: rMul(rAdd(loR, hiR), rat(1n, 2n)) });
      } else {
        const loF = lo === null ? null : lo.v, hiF = hi === null ? null : hi.v;
        let f;
        if (loF === null && hiF === null) f = 0;
        else if (loF === null) f = hiF - Math.max(1, Math.abs(hiF) / 2);
        else if (hiF === null) f = loF + Math.max(1, Math.abs(loF) / 2);
        else f = (loF + hiF) / 2;
        samples.push({ exact: false, r: f });
      }
    }
    const signAt = (p, s) => {
      const v = s.exact ? pEvalR(p, s.r) : pEvalF(p, s.r);
      return s.exact ? (v.n < 0n ? -1 : v.n > 0n ? 1 : 0) : (v < 0 ? -1 : v > 0 ? 1 : 0);
    };

    // marqueur 0 seulement là où la valeur est définie ; la valeur interdite
    // est la double barre verticale du tableau (tracée par la mise en page)
    const hasRootAt = (roots, b) => roots.some(rt => near(valOf(rt), b.v));
    const rows = polys.map((fr, i) => ({
      label: fr.label,
      side: fr.den ? 'den' : 'num',
      markers: bounds.map(b => (!b.denZero && hasRootAt(rootLists[i], b)) ? 'zero' : null),
      signs: samples.map(sm => signAt(fr.poly, sm))
    }));
    const fSigns = samples.map(sm => {
      let sg = csign;
      for (const fr of polys) sg *= signAt(fr.poly, sm);
      return sg;
    });
    const fMarkers = bounds.map(b => b.denZero ? null : (b.numZero ? 'zero' : null));

    return {
      ok: true,
      expr: parsed.src,
      boundaries: bounds.map(b => ({ label: b.label, approx: b.approx, numZero: b.numZero, denZero: b.denZero })),
      rows: rows,
      f: { label: 'f(x)', markers: fMarkers, signs: fSigns }
    };
  }

  /* ---------------- mise en page SVG ---------------- */

  function textW(s, fs) { // estimation serif prudente (largeur)
    let w = 0;
    for (const ch of String(s)) {
      if (ch === ' ' || ch === '\u00b7') w += fs * 0.34;
      else if ('.,;:!|'.indexOf(ch) >= 0) w += fs * 0.3;
      else if ('iIl1j()[]'.indexOf(ch) >= 0) w += fs * 0.36;
      else if ('ftr'.indexOf(ch) >= 0) w += fs * 0.42;
      else w += fs * 0.58;
    }
    return w;
  }

  const MINUS = '\u2212';

  function computeLayout(model) {
    const rows = model.rows.map(r => ({ label: r.label, markers: r.markers, signs: r.signs, isF: false }))
      .concat([{ label: model.f.label, markers: model.f.markers, signs: model.f.signs, isF: true }]);
    const G = { padX: 16, padY: 14, headerH: 36, rowH: 36, fRowH: 42, minColW: 82 };
    const bLabels = model.boundaries.map(b => b.label);
    const allLabels = rows.map(r => r.label).concat(['x']);
    const labelW = Math.max(78, Math.max.apply(null, allLabels.map(t => textW(t, 15)))) + 30;
    const maxB = Math.max(46, Math.max.apply(null, bLabels.map(t => textW(t, 15))));
    const colW = Math.max(G.minColW, maxB + 34);
    const nI = model.boundaries.length + 1;
    const x0 = G.padX + labelW;
    const xR = x0 + nI * colW;
    const W = xR + G.padX;
    const yT = G.padY;
    let y = yT + G.headerH;
    const rowY = [];
    for (const r of rows) { rowY.push(y); y += r.isF ? G.fRowH : G.rowH; }
    const yB = y;
    const bX = model.boundaries.map((b, k) => x0 + (k + 1) * colW);

    const P = [];
    const line = (x1, y1, x2, y2, w) => P.push({ t: 'line', x1: x1, y1: y1, x2: x2, y2: y2, w: w || 1.1 });
    const text = (x, yy, s, o) => P.push(Object.assign({ t: o.white ? 'wtext' : 'text', x: x, y: yy, s: s }, o));
    const zero = (x, yy, big) => P.push({ t: 'zero', x: x, y: yy, rx: big ? 7.8 : 7.2, ry: big ? 10 : 9.2 });

    // cadre : haut, bas, séparateur de la colonne des libellés
    line(G.padX, yT, xR, yT, 1.4);
    line(G.padX, yB, xR, yB, 1.4);
    line(x0, yT, x0, yB, 1.1);
    // ligne sous l'en-tête + séparations entre lignes
    line(G.padX, yT + G.headerH, xR, yT + G.headerH, 1.1);
    for (let i = 0; i < rows.length - 1; i++) {
      const yy = rowY[i] + (rows[i].isF ? G.fRowH : G.rowH);
      line(G.padX, yy, xR, yy, 1.1);
    }

    // barres verticales des bornes : double barre si valeur interdite
    model.boundaries.forEach((b, k) => {
      if (b.denZero) { line(bX[k] - 2.4, yT, bX[k] - 2.4, yB, 1.1); line(bX[k] + 2.4, yT, bX[k] + 2.4, yB, 1.1); }
      else line(bX[k], yT, bX[k], yB, 1.1);
    });

    // en-tête : x, -infini, valeurs, +infini
    const hc = yT + G.headerH / 2;
    text(G.padX + labelW / 2, hc, 'x', { fs: 16, italic: true, anchor: 'middle' });
    text(x0, hc, '\u2212\u221e', { fs: 16, italic: true, anchor: 'middle', white: true });
    text(xR, hc, '+\u221e', { fs: 16, italic: true, anchor: 'middle', white: true });
    bLabels.forEach((lb, k) => text(bX[k], hc, lb, { fs: 15, italic: true, anchor: 'middle', white: true }));

    // lignes : libellés, signes, 0 coupés posés sur la barre
    rows.forEach((r, i) => {
      const h = r.isF ? G.fRowH : G.rowH;
      const cy = rowY[i] + h / 2;
      text(x0 - 12, cy, r.label, { fs: 15, italic: true, bold: r.isF, anchor: 'end' });
      for (let k = 0; k < nI; k++) {
        const sg = r.signs[k] === '+' ? '+' : (r.signs[k] === -1 || r.signs[k] === '-') ? MINUS : null;
        if (sg) text(x0 + k * colW + colW / 2, cy, sg, { fs: r.isF ? 18 : 17, bold: r.isF, anchor: 'middle' });
      }
      r.markers.forEach((m, k) => { if (m === 'zero') zero(bX[k], cy, r.isF); });
    });

    return { W: W, H: yB + G.padY, prims: P, colW: colW, x0: x0, xR: xR, yT: yT, yB: yB };
  }

  function escXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function svgInner(L) {
    let s = '';
    s += '<rect x="0" y="0" width="' + L.W + '" height="' + L.H + '" fill="#ffffff"/>';
    for (const p of L.prims) {
      if (p.t === 'line') {
        s += '<line x1="' + p.x1 + '" y1="' + p.y1 + '" x2="' + p.x2 + '" y2="' + p.y2 + '" stroke="#000000" stroke-width="' + p.w + '"/>';
      } else if (p.t === 'zero') {
        s += '<ellipse cx="' + p.x + '" cy="' + p.y + '" rx="' + p.rx + '" ry="' + p.ry + '" fill="none" stroke="#000000" stroke-width="1.5"/>';
      } else if (p.t === 'text' || p.t === 'wtext') {
        if (p.t === 'wtext') {
          const w = textW(p.s, p.fs) + 8;
          s += '<rect x="' + (p.x - w / 2) + '" y="' + (p.y - p.fs * 0.72) + '" width="' + w + '" height="' + (p.fs * 1.44) + '" fill="#ffffff"/>';
        }
        s += '<text x="' + p.x + '" y="' + p.y + '" font-size="' + p.fs + '" fill="#000000" text-anchor="' + (p.anchor || 'middle') + '"' +
          (p.italic ? ' font-style="italic"' : '') + (p.bold ? ' font-weight="700"' : '') +
          ' dominant-baseline="central">' + escXml(p.s) + '</text>';
      }
    }
    return s;
  }

  function exportSvg(model) {
    const L = computeLayout(model);
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + L.W + '" height="' + L.H +
      '" viewBox="0 0 ' + L.W + ' ' + L.H + '" font-family="' + SERIF + '">' +
      svgInner(L) + '</svg>';
  }

  return {
    normalize: normalize, parse: parse, analyze: analyze,
    computeLayout: computeLayout, svgInner: svgInner, exportSvg: exportSvg,
    fmtRat: fmtRat, fmtApprox: fmtApprox, prettyLabel: prettyLabel, sup: sup
  };
})();
});
