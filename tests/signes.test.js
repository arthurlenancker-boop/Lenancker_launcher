'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../apps/signes/core.js');

const ok = (src) => {
  const r = S.analyze(src);
  if (!r.ok) throw new Error('attendu ok pour « ' + src + ' », reçu : ' + r.error);
  return r;
};

test('le module est requireable sous Node (UMD)', () => {
  assert.ok(S && typeof S.analyze === 'function');
  assert.equal(typeof S.computeLayout, 'function');
  assert.equal(typeof S.exportSvg, 'function');
});

/* ---------------- normalisation ---------------- */

test('normalize : minuscules, unicode, f(x)=, espaces, virgule', () => {
  assert.equal(S.normalize('F(X) = X² − 3x + 2'), 'x^2-3x+2');
  assert.equal(S.normalize('y=2 × x'), '2*x');
  assert.equal(S.normalize('0,5x'), '0.5x');
  assert.equal(S.normalize('  ( x-1 ) ( x+2 ) '), '(x-1)(x+2)');
  assert.equal(S.normalize('x³'), 'x^3');
});

/* ---------------- parseur : erreurs en français ---------------- */

test('erreurs : vide, lettre inconnue, parenthèses, exposant', () => {
  assert.equal(S.analyze('').ok, false);
  assert.match(S.analyze('').error, /Écris d/);
  assert.match(S.analyze('x+y').error, /y/);
  assert.match(S.analyze('(x-1').error, /fermante manquante/);
  assert.match(S.analyze('x-1)').error, /fermante inattendue/);
  assert.match(S.analyze('x^').error, /exposant/);
  assert.equal(S.analyze('x^99').ok, false);
  assert.equal(S.analyze('x^x').ok, false);
});

test('f identiquement nulle ou division par zéro constante', () => {
  assert.match(S.analyze('x-x').error, /0 partout/);
  assert.match(S.analyze('2*(x-x)/(x-1)').error, /0 partout/);
  assert.equal(S.analyze('2/0').ok, false);
});

/* ---------------- tableau de référence : (2x-1)(x+3)/(x-2) ---------------- */

test('(2x-1)(x+3)/(x-2) : bornes, lignes, signes', () => {
  const r = ok('(2x-1)(x+3)/(x-2)');
  assert.deepEqual(r.boundaries.map(b => b.label), ['-3', '1/2', '2']);
  assert.deepEqual(r.boundaries.map(b => b.denZero), [false, false, true]);
  assert.deepEqual(r.rows.map(x => x.label), ['2x-1', 'x+3', 'x-2']);
  assert.deepEqual(r.rows[0].signs, [-1, -1, 1, 1]);
  assert.deepEqual(r.rows[1].signs, [-1, 1, 1, 1]);
  assert.deepEqual(r.rows[2].signs, [-1, -1, -1, 1]);
  assert.deepEqual(r.f.signs, [-1, 1, -1, 1]);
  // 0 coupés : facteurs 2x-1 (en 1/2) et x+3 (en -3), et f s'annule en -3 et 1/2
  assert.deepEqual(r.rows[0].markers, [null, 'zero', null]);
  assert.deepEqual(r.rows[1].markers, ['zero', null, null]);
  assert.deepEqual(r.rows[2].markers, [null, null, null]); // dénominateur : double barre, pas de 0
  assert.deepEqual(r.f.markers, ['zero', 'zero', null]);   // en 2 : interdite, pas de 0
});

test('polynôme développé : x²-3x+2 reste une seule ligne, racines exactes', () => {
  const r = ok('x²-3x+2');
  assert.deepEqual(r.rows.map(x => x.label), ['x²-3x+2']);
  assert.deepEqual(r.boundaries.map(b => b.label), ['1', '2']);
  assert.deepEqual(r.f.signs, [1, -1, 1]);
  assert.deepEqual(r.f.markers, ['zero', 'zero']);
});

test('-x²+5x-6 : signe global retourné par le coefficient dominant', () => {
  const r = ok('-x²+5x-6');
  assert.deepEqual(r.boundaries.map(b => b.label), ['2', '3']);
  assert.deepEqual(r.f.signs, [-1, 1, -1]);
});

test('x²+1 : aucune borne, signe constant positif', () => {
  const r = ok('x²+1');
  assert.deepEqual(r.boundaries, []);
  assert.deepEqual(r.f.signs, [1]);
});

test('constantes : 3 positif partout, -2 négatif partout, sans lignes', () => {
  assert.deepEqual(ok('3').f.signs, [1]);
  assert.deepEqual(ok('3').rows, []);
  assert.deepEqual(ok('-2').f.signs, [-1]);
});

test('x : racine 0, signes - puis +', () => {
  const r = ok('x');
  assert.deepEqual(r.boundaries.map(b => b.label), ['0']);
  assert.deepEqual(r.f.signs, [-1, 1]);
  assert.deepEqual(r.f.markers, ['zero']);
});

test('-2x : le signe de tête reste dans la même ligne', () => {
  const r = ok('-2x');
  assert.deepEqual(r.rows.map(x => x.label), ['-2x']);
  assert.deepEqual(r.f.signs, [1, -1]);
});

test('multiplicité paire : (x-1)² ne change pas de signe', () => {
  const r = ok('(x-1)²');
  assert.deepEqual(r.rows.map(x => x.label), ['(x-1)²']);
  assert.deepEqual(r.boundaries.map(b => b.label), ['1']);
  assert.deepEqual(r.rows[0].signs, [1, 1]);
  assert.deepEqual(r.f.markers, ['zero']);
  assert.deepEqual(r.f.signs, [1, 1]);
});

test('1/x : valeur interdite en 0, double barre sans 0', () => {
  const r = ok('1/x');
  assert.deepEqual(r.boundaries.map(b => b.label), ['0']);
  assert.equal(r.boundaries[0].denZero, true);
  assert.deepEqual(r.f.markers, [null]);
  assert.deepEqual(r.f.signs, [-1, 1]);
});

test('(x-1)/(x-1) : l interdite prime sur le zéro', () => {
  const r = ok('(x-1)/(x-1)');
  assert.deepEqual(r.f.markers, [null]);
  assert.equal(r.boundaries[0].denZero, true);
  assert.deepEqual(r.f.signs, [1, 1]);
});

test('racines irréductibles : x²-2 donne ≈ ±1,41', () => {
  const r = ok('x²-2');
  assert.deepEqual(r.boundaries.map(b => b.label), ['≈ -1,41', '≈ 1,41']);
  assert.equal(r.boundaries[0].approx, true);
  assert.deepEqual(r.f.signs, [1, -1, 1]);
});

test('fraction rationnelle multiple : (x+3)/(x(x-1))', () => {
  const r = ok('(x+3)/(x(x-1))');
  assert.deepEqual(r.boundaries.map(b => b.label), ['-3', '0', '1']);
  assert.deepEqual(r.boundaries.map(b => b.denZero), [false, true, true]);
  assert.deepEqual(r.f.signs, [-1, 1, -1, 1]);
  assert.deepEqual(r.f.markers, ['zero', null, null]);
});

/* ---------------- repli : sommes contenant des quotients ---------------- */

test('1/(x-1)+2 se réduit en (2x-1)/(x-1), lignes factorisées', () => {
  const r = ok('1/(x-1)+2');
  assert.deepEqual(r.rows.map(x => x.label), ['2x-1', 'x-1']);
  assert.deepEqual(r.boundaries.map(b => b.label), ['1/2', '1']);
  assert.deepEqual(r.f.signs, [1, -1, 1]);
});

test('x/(x-1)+3/(x+2) : réduction puis facteurs du dénominateur', () => {
  const r = ok('x/(x-1)+3/(x+2)');
  assert.deepEqual(r.rows.map(x => x.label), ['x²+5x-3', 'x+2', 'x-1']);
  assert.equal(r.boundaries.length, 4); // 2 racines approchées + 2 interdites
  assert.deepEqual(r.boundaries.map(b => b.denZero), [false, true, false, true]);
  assert.deepEqual(r.f.signs, [1, -1, 1, -1, 1]);
});

test('repli avec multiplicité : 2/(x-1)² garde la puissance sur une ligne', () => {
  const r = ok('2/(x-1)²');
  assert.deepEqual(r.rows.map(x => x.label), ['(x-1)²']);
  assert.deepEqual(r.f.signs, [1, 1]);
  assert.deepEqual(r.f.markers, [null]);
});

/* ---------------- mise en page SVG ---------------- */

test('layout : 0 coupés en ellipses sur les barres, double barre aux interdites', () => {
  const r = ok('(2x-1)(x+3)/(x-2)');
  const L = S.computeLayout(r);
  const zeros = L.prims.filter(p => p.t === 'zero');
  assert.equal(zeros.length, 4); // 2x-1, x+3, et f en -3 et 1/2
  const svg = S.svgInner(L);
  assert.match(svg, /<ellipse/);
  assert.match(svg, /f\(x\)/);
  assert.match(svg, /-3/);
  assert.ok(svg.includes('1/2'));
  assert.ok(svg.includes('\u2212\u221e'));
  assert.ok(svg.includes('\u2212')); // signe moins typographique
});

test('double barre : deux lignes verticales à la valeur interdite', () => {
  const r = ok('(x+3)/(x(x-1))');
  const L = S.computeLayout(r);
  // bornes -3, 0, 1 : verticales = 1 (séparateur libellés) + 1 + 2 + 2 = 6
  const vlines = L.prims.filter(p => p.t === 'line' && p.y1 === L.yT && p.y2 === L.yB && p.x1 === p.x2);
  assert.equal(vlines.length, 6);
});

test('exportSvg : document autonome avec fond blanc', () => {
  const s = S.exportSvg(ok('x²-3x+2'));
  assert.match(s, /^<\?xml/);
  assert.match(s, /<svg xmlns/);
  assert.match(s, /fill="#ffffff"/);
});

test('étiquettes : fractions et arrondis français', () => {
  assert.equal(S.fmtRat({ n: 3n, d: 2n }), '3/2');
  assert.equal(S.fmtRat({ n: -3n, d: 2n }), '-3/2');
  assert.equal(S.fmtRat({ n: 2n, d: 1n }), '2');
  assert.equal(S.fmtApprox(Math.sqrt(2)), '≈ 1,41');
  assert.equal(S.prettyLabel('(x-1)^2'), '(x-1)²');
  assert.equal(S.prettyLabel('(2x-1)'), '2x-1');
  assert.equal(S.prettyLabel('0.5x-1'), '0,5x-1');
});

test('robustesse : chaînes farfelues refusées proprement', () => {
  for (const bad of ['()', ')', '2..3', '(x-1))', 'x^1.5', '1/(x-1)+', '**']) {
    assert.equal(S.analyze(bad).ok, false, 'devrait échouer : ' + bad);
  }
});
