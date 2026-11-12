import React, { useEffect, useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  continueRender,
  delayRender,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { CUES, DURATION_IN_FRAMES, FPS, SCENES } from "./timing";
import { T } from "./style";
import {
  SceneCer,
  SceneDataset,
  ScenePayoff,
  SceneProbleme,
  SceneSolution,
  SceneTroc,
} from "./scenes";

const COMPS = [
  SceneProbleme,
  SceneSolution,
  SceneDataset,
  SceneTroc,
  SceneCer,
  ScenePayoff,
];

const Legendes: React.FC = () => {
  const f = useCurrentFrame();
  const cue = useMemo(() => CUES.find((c) => f >= c.start && f < c.end), [f]);
  if (!cue) return null;
  return (
    <div
      style={{
        position: "absolute",
        bottom: 56,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "rgba(15, 14, 11, 0.82)",
          border: `1px solid ${T.stroke}`,
          borderRadius: 12,
          padding: "12px 26px",
          fontFamily: T.font,
          fontSize: 26,
          fontWeight: 600,
          color: T.ink,
          lineHeight: 1.3,
          textAlign: "center",
          maxWidth: 900,
        }}
      >
        {cue.texte}
      </div>
    </div>
  );
};

export const Explainer: React.FC = () => {
  useEffect(() => {
    const handle = delayRender("attente des polices Inter");
    document.fonts.ready.then(() => continueRender(handle));
    return () => continueRender(handle);
  }, []);
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${T.bg} 0%, ${T.bg2} 60%, ${T.bg} 100%)`,
        fontFamily: T.font,
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @font-face { font-family: 'Inter'; font-weight: 400; src: url('${staticFile(
              "fonts/inter-400.woff2"
            )}') format('woff2'); }
            @font-face { font-family: 'Inter'; font-weight: 600; src: url('${staticFile(
              "fonts/inter-600.woff2"
            )}') format('woff2'); }
            @font-face { font-family: 'Inter'; font-weight: 700; src: url('${staticFile(
              "fonts/inter-700.woff2"
            )}') format('woff2'); }
            @font-face { font-family: 'Inter'; font-weight: 800; src: url('${staticFile(
              "fonts/inter-800.woff2"
            )}') format('woff2'); }
          `,
        }}
      />
      {SCENES.map((s, i) => (
        <Sequence key={s.index} from={s.start} durationInFrames={s.duration}>
          <Audio src={staticFile(`audio/line${s.index}.mp3`)} />
          {React.createElement(COMPS[i])}
        </Sequence>
      ))}
      <Legendes />
    </AbsoluteFill>
  );
};

export const meta = { fps: FPS, durationInFrames: DURATION_IN_FRAMES };
