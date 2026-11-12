import type { CSSProperties } from "react";

export const T = {
  bg: "#0f0e0b",
  bg2: "#181410",
  ink: "#f2efe7",
  inkDim: "#a8a294",
  inkFaint: "#6e6a5f",
  accent: "#ff5310",
  accentSoft: "rgba(255, 83, 16, 0.14)",
  onAccent: "#160b05",
  glass: "rgba(242, 239, 231, 0.035)",
  glassStrong: "rgba(242, 239, 231, 0.07)",
  stroke: "rgba(242, 239, 231, 0.12)",
  font: "Inter, sans-serif",
};

export const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

export const card: CSSProperties = {
  background: T.glass,
  border: `1px solid ${T.stroke}`,
  borderRadius: 20,
  backdropFilter: "blur(10px)",
};

export const chip: CSSProperties = {
  display: "inline-block",
  padding: "8px 18px",
  borderRadius: 999,
  border: `1px solid ${T.stroke}`,
  background: T.glassStrong,
  color: T.inkDim,
  fontFamily: T.font,
  fontSize: 22,
  fontWeight: 600,
};
