import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { T, card, chip } from "./style";

/* ── Scène 0 : le problème ─────────────────────────────────────── */

const DOCS = ["Notes de cours", "Photo du tableau", "PDF de 40 pages"];

export const SceneProbleme: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 56 }}>
      <div style={{ display: "flex", gap: 32 }}>
        {DOCS.map((d, i) => {
          const k = spring({ frame: f - i * 8, fps, config: { damping: 14 } });
          return (
            <div
              key={d}
              style={{
                ...card,
                width: 240,
                height: 170,
                padding: 24,
                transform: `translateY(${(1 - k) * 60}px) rotate(${(i - 1) * 3}deg)`,
                opacity: k,
              }}
            >
              <div style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, color: T.ink }}>
                {d}
              </div>
              {[0, 1, 2, 3].map((l) => (
                <div
                  key={l}
                  style={{
                    height: 8,
                    borderRadius: 4,
                    background: T.stroke,
                    marginTop: 14,
                    width: `${[92, 100, 78, 60][l]}%`,
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>
      <div
        style={{
          fontFamily: T.font,
          fontSize: 44,
          fontWeight: 800,
          color: T.accent,
          opacity: interpolate(f, [55, 70], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          transform: `translateY(${interpolate(f, [55, 70], [16, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}px)`,
        }}
      >
        Tout retaper à la main ?
      </div>
    </AbsoluteFill>
  );
};

/* ── Scène 1 : la solution ─────────────────────────────────────── */

export const SceneSolution: React.FC = () => {
  const f = useCurrentFrame();
  const k = interpolate(f, [0, 16], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 28 }}>
      <div style={{ ...chip, borderColor: T.accent, color: T.accent, opacity: k }}>
        entraîné pour toi · hors-ligne
      </div>
      <div
        style={{
          fontFamily: T.font,
          fontSize: 84,
          fontWeight: 800,
          color: T.ink,
          letterSpacing: "-0.03em",
          opacity: k,
          transform: `scale(${0.94 + 0.06 * k})`,
        }}
      >
        Un modèle OCR <span style={{ color: T.accent }}>local</span>
      </div>
      <div style={{ fontFamily: T.font, fontSize: 26, color: T.inkDim, opacity: interpolate(f, [20, 34], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
        il lit tes images, sans cloud, sans clé API
      </div>
    </AbsoluteFill>
  );
};

/* ── Scène 2 : le dataset synthétique ──────────────────────────── */

const AUGS = ["bruit", "flou", "rotation", "éclairage"];

export const SceneDataset: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = Math.round(interpolate(f, [0, 45], [0, 50000], { extrapolateRight: "clamp" }));
  // la ligne de texte se dégrade au fil de la scène (déterministe)
  const degrade = interpolate(f, [40, 110], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 26, paddingBottom: 120 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
        <div style={{ fontFamily: T.font, fontSize: 110, fontWeight: 800, color: T.accent }}>
          {n.toLocaleString("fr-FR")}
        </div>
        <div style={{ fontFamily: T.font, fontSize: 30, color: T.inkDim, fontWeight: 600 }}>
          lignes générées
        </div>
      </div>
      <div style={{ ...card, padding: "22px 34px", display: "flex", gap: 16 }}>
        {["français", "anglais", "∑ maths"].map((t, i) => (
          <div key={t} style={{ ...chip, opacity: interpolate(f, [10 + i * 8, 20 + i * 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
            {t}
          </div>
        ))}
      </div>
      {/* ligne simulée qui s'abîme */}
      <div
        style={{
          background: "#f6f2e8",
          color: "#1a1712",
          fontFamily: T.font,
          fontWeight: 600,
          fontSize: 30,
          padding: "22px 38px",
          borderRadius: 14,
          transform: `rotate(${degrade * 2.4}deg)`,
          filter: `blur(${degrade * 1.4}px) contrast(${1 - degrade * 0.25})`,
          boxShadow: "0 12px 40px rgba(0,0,0,.4)",
        }}
      >
        lim_(h→0) [f(x+h) − f(x)] / h
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        {AUGS.map((a, i) => {
          const k = spring({ frame: f - (60 + i * 10), fps, config: { damping: 15 } });
          return (
            <div key={a} style={{ ...chip, opacity: k, transform: `translateY(${(1 - k) * 18}px)` }}>
              {a}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ── Scène 3 : l'architecture TrOCR ─────────────────────────────── */

export const SceneTroc: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const node = (delay: number) => {
    const k = spring({ frame: f - delay, fps, config: { damping: 14 } });
    return { opacity: k, transform: `scale(${0.85 + 0.15 * k})` };
  };
  const edge = (delay: number) =>
    interpolate(f, [delay, delay + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const boite: React.CSSProperties = {
    ...card,
    width: 220,
    height: 150,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
  };
  const fleche = (k: number) => (
    <div style={{ width: 90, display: "flex", alignItems: "center" }}>
      <div style={{ height: 3, background: T.accent, width: `${k * 100}%`, borderRadius: 2, transform: "translateY(-8px)" }} />
    </div>
  );
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 44 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={{ ...boite, ...node(0) }}>
          <div style={{ fontSize: 44 }}>🖼️</div>
          <div style={{ fontFamily: T.font, fontSize: 18, color: T.inkDim, fontWeight: 600 }}>image d'une ligne</div>
        </div>
        {fleche(edge(14))}
        <div style={{ ...boite, ...node(22), borderColor: T.accent }}>
          <div style={{ fontSize: 44 }}>👁️</div>
          <div style={{ fontFamily: T.font, fontSize: 18, color: T.ink, fontWeight: 700 }}>encodeur ViT — « l'œil »</div>
        </div>
        {fleche(edge(38))}
        <div style={{ ...boite, ...node(46), borderColor: T.accent }}>
          <div style={{ fontSize: 44 }}>✍️</div>
          <div style={{ fontFamily: T.font, fontSize: 18, color: T.ink, fontWeight: 700 }}>décodeur — « la bouche »</div>
        </div>
        {fleche(edge(62))}
        <div
          style={{
            ...node(70),
            background: "#f6f2e8",
            color: "#1a1712",
            borderRadius: 14,
            padding: "20px 26px",
            fontFamily: T.font,
            fontWeight: 700,
            fontSize: 26,
          }}
        >
          f'(x) = …
        </div>
      </div>
      <div
        style={{
          fontFamily: T.font,
          fontSize: 26,
          color: T.inkDim,
          opacity: interpolate(f, [95, 115], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        il écrit <span style={{ color: T.ink, fontWeight: 700 }}>un caractère à la fois</span>, avec le contexte
      </div>
    </AbsoluteFill>
  );
};

/* ── Scène 4 : la métrique CER ──────────────────────────────────── */

export const SceneCer: React.FC = () => {
  const f = useCurrentFrame();
  const k = interpolate(f, [10, 130], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const cer = 100 - k * 95.2; // 100 % → 4,8 %
  const largeur = 560;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 36 }}>
      <div style={{ fontFamily: T.font, fontSize: 26, color: T.inkDim, fontWeight: 600 }}>
        CER — taux d'erreur par caractère
      </div>
      <div style={{ fontFamily: T.font, fontSize: 130, fontWeight: 800, color: cer <= 5 ? T.accent : T.ink, letterSpacing: "-0.03em" }}>
        {cer.toFixed(1).replace(".", ",")} %
      </div>
      <div style={{ width: largeur, position: "relative" }}>
        <div style={{ height: 14, background: T.glassStrong, borderRadius: 7, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${cer}%`, background: T.accent, borderRadius: 7 }} />
        </div>
        {/* repère objectif à 5 % */}
        <div style={{ position: "absolute", left: `${0.05 * largeur}px`, top: -10, height: 34, width: 3, background: T.ink, borderRadius: 2 }} />
        <div style={{ position: "absolute", left: `${0.05 * largeur}px`, top: 28, fontFamily: T.font, fontSize: 18, color: T.inkDim, transform: "translateX(6px)" }}>
          objectif &lt; 5 %
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ── Scène 5 : le résultat + CTA ────────────────────────────────── */

export const ScenePayoff: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const k = spring({ frame: f - 6, fps, config: { damping: 16 } });
  const k2 = interpolate(f, [50, 68], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        {/* carte launcher */}
        <div style={{ ...card, padding: 26, transform: `scale(${k})`, opacity: k }}>
          <div style={{ fontFamily: T.font, fontSize: 20, fontWeight: 700, color: T.ink, marginBottom: 16 }}>
            Lenancker Launcher
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 64px)", gap: 12 }}>
            {["OCR", "Focus", "Révision", "Probabilités", "…", "…"].map((a) => (
              <div key={a} style={{ height: 64, borderRadius: 12, background: T.glassStrong, border: `1px solid ${T.stroke}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.font, fontSize: 13, color: a === "OCR" ? T.accent : T.inkDim, fontWeight: 700 }}>
                {a}
              </div>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 44, color: T.accent, opacity: k2 }}>→</div>
        {/* texte extrait */}
        <div
          style={{
            background: "#f6f2e8",
            color: "#1a1712",
            borderRadius: 14,
            padding: "22px 28px",
            fontFamily: T.font,
            fontSize: 22,
            fontWeight: 600,
            lineHeight: 1.6,
            width: 330,
            opacity: k2,
            transform: `translateY(${(1 - k2) * 20}px)`,
          }}
        >
          Théorème fondamental : toute fonction dérivable est continue…
        </div>
      </div>
      <div
        style={{
          fontFamily: T.font,
          fontSize: 34,
          fontWeight: 800,
          color: T.ink,
          opacity: interpolate(f, [110, 128], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        Le code est prêt — <span style={{ color: T.accent }}>ml/ocr/</span> · lance l'entraînement
      </div>
    </AbsoluteFill>
  );
};
