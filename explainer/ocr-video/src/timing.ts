import timingsBrut from "../timings.json";

const _tmp = (timingsBrut as unknown) as { default?: unknown };
const _inter =
  _tmp && typeof _tmp === "object" && "default" in _tmp ? _tmp.default : _tmp;
const timings =
  typeof _inter === "string" ? JSON.parse(_inter) : (_inter as typeof timingsBrut);

export type Mot = { mot: string; debut_s: number; fin_s: number };
export type Ligne = { texte: string; duree_s: number; mots: Mot[] };

export const FPS: number = timings.fps;
export const LIGNES: Ligne[] = timings.lignes;

export type Scene = {
  index: number;
  start: number; // frame de début (globale)
  duration: number; // frames
  ligne: Ligne;
};

const s = (f: number) => Math.round(f);

export const SCENES: Scene[] = (() => {
  let acc = 0;
  return LIGNES.map((ligne, index) => {
    const start = acc;
    const duration = s(ligne.duree_s * FPS);
    acc += duration;
    return { index, start, duration, ligne };
  });
})();

export const DURATION_IN_FRAMES = SCENES[SCENES.length - 1].start + SCENES[SCENES.length - 1].duration;

export type Cue = { texte: string; start: number; end: number };

// Regroupe les mots en légendes : <= 42 caractères, >= 1 s à l'écran.
export const CUES: Cue[] = (() => {
  const cues: Cue[] = [];
  for (const scene of SCENES) {
    const mots = scene.ligne.mots;
    if (!mots.length) continue;
    let lot: Mot[] = [];
    const push = () => {
      if (!lot.length) return;
      const texte = lot.map((m) => m.mot).join(" ");
      const start = scene.start + s(lot[0].debut_s * FPS);
      let end = scene.start + s(lot[lot.length - 1].fin_s * FPS) + 4;
      if (end - start < FPS) end = start + FPS; // >= 1 s
      cues.push({ texte, start, end });
      lot = [];
    };
    for (const m of mots) {
      const courant = lot.map((x) => x.mot).join(" ");
      if (lot.length && (courant.length + m.mot.length + 1) > 42) push();
      lot.push(m);
    }
    push();
  }
  // pas de chevauchement
  for (let i = 0; i < cues.length - 1; i++) {
    if (cues[i].end > cues[i + 1].start) cues[i].end = cues[i + 1].start - 1;
  }
  return cues;
})();
