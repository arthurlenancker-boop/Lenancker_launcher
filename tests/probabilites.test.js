'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Arbre = require('../apps/probabilites/core.js');

test('le module est requireable sous Node (UMD)', () => {
  assert.ok(Arbre && typeof Arbre.computeLayout === 'function');
  assert.equal(typeof Arbre.exportSvg, 'function');
});

test('defaultState : 1 niveau, orientation horizontale, 2 branches', () => {
  const s = Arbre.defaultState();
  assert.equal(s.levels.length, 1);
  assert.equal(s.orientation, 'h');
  assert.equal(s.notation, 'bar');
  assert.equal(Arbre.branchCount(s, 'R'), 2);
  assert.equal(Arbre.branchCount(s, 'R-0', ), 2);
});

test('branchCount borne 2..4', () => {
  const s = Arbre.defaultState();
  s.branches['R'] = 1;
  assert.equal(Arbre.branchCount(s, 'R'), 2);
  s.branches['R'] = 9;
  assert.equal(Arbre.branchCount(s, 'R'), 4);
});

test('buildTree : 2 niveaux = 4 feuilles, parents centrés, aucun chevauchement', () => {
  const s = Arbre.defaultState();
  s.levels.push({ event: 'T', complement: '' });
  const L = Arbre.computeLayout(s);
  assert.equal(L.leaves.length, 4);
  const rows = L.leaves.map((n) => n.row);
  assert.deepEqual(rows, [0, 1, 2, 3]);
  const root = L.root;
  const mid = (L.leaves[0].row + L.leaves[3].row) / 2;
  assert.equal(root.row, mid);
  const ys = L.leaves.map((n) => n.y);
  assert.equal(new Set(ys).size, 4);
  const sorted = ys.slice().sort((a, b) => a - b);
  assert.deepEqual(ys, sorted);
});

test('nodeInfo : complément auto (barre) si vide, sinon saisi', () => {
  const s = Arbre.defaultState();
  s.levels[0] = { event: 'G', complement: '' };
  const ev = Arbre.nodeInfo(s, 'R-0');
  const comp = Arbre.nodeInfo(s, 'R-1');
  assert.equal(ev.base, 'G');
  assert.equal(ev.auto, false);
  assert.equal(comp.base, 'G');
  assert.equal(comp.auto, true);
  assert.equal(comp.comp, true);
  s.levels[0].complement = 'H';
  assert.equal(Arbre.nodeInfo(s, 'R-1').base, 'H');
  assert.equal(Arbre.nodeInfo(s, 'R-1').auto, false);
});

test('branche supplémentaire : label saisi, index ≥ 2', () => {
  const s = Arbre.defaultState();
  s.branches['R'] = 3;
  s.labels['R-2'] = 'B';
  const L = Arbre.computeLayout(s);
  assert.equal(L.leaves.length, 3);
  assert.equal(Arbre.nodeInfo(s, 'R-2').base, 'B');
  assert.equal(Arbre.nodeInfo(s, 'R-0').base, 'G');
});

test('nœud terminé en feuille : pas d\'enfant au-delà', () => {
  const s = Arbre.defaultState();
  s.levels.push({ event: 'T', complement: '' });
  s.choices['R-0'] = 'leaf';
  const L = Arbre.computeLayout(s);
  const leaf01 = L.nodes.find((n) => n.id === 'R-0');
  assert.equal(leaf01.children.length, 0);
  assert.equal(L.leaves.length, 3);
});

test('probabilités portées par les arêtes, résultats par les feuilles', () => {
  const s = Arbre.defaultState();
  s.probs['R-0'] = '0,3';
  s.probs['R-1'] = '3/10';
  s.results['R-0'] = '0,09';
  const L = Arbre.computeLayout(s);
  assert.equal(L.edges.length, 2);
  assert.equal(L.edges.find((e) => e.child === 'R-0').prob, '0,3');
  assert.equal(L.inputs.length, 2);
  assert.equal(L.inputs.find((i) => i.nid === 'R-0').value, '0,09');
  assert.ok(L.total);
  assert.equal(L.total.value, '');
});

test('échappement HTML dans le SVG exporté', () => {
  const s = Arbre.defaultState();
  s.experiment = 'Lancer <pierre> & "ciseaux"';
  s.levels[0].event = 'A<b>';
  s.probs['R-0'] = '<w>';
  const svg = Arbre.exportSvg(s);
  assert.ok(svg.startsWith('<?xml'));
  assert.ok(!svg.includes('<pierre>'));
  assert.ok(!svg.includes('<w>'));
  assert.ok(svg.includes('&lt;pierre&gt;'));
  assert.ok(svg.includes('&amp;'));
});

test('dimensions positives, orientation verticale', () => {
  const s = Arbre.defaultState();
  const h = Arbre.computeLayout(s);
  assert.ok(h.W > 0 && h.H > 0);
  assert.equal(h.vert, false);
  s.orientation = 'v';
  const v = Arbre.computeLayout(s);
  assert.equal(v.vert, true);
  assert.ok(v.W > 0 && v.H > 0);
});
