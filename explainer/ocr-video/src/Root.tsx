import React from "react";
import { Composition } from "remotion";
import { Explainer } from "./Explainer";
import { DURATION_IN_FRAMES, FPS } from "./timing";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Explainer"
    component={Explainer}
    durationInFrames={DURATION_IN_FRAMES}
    fps={FPS}
    width={1280}
    height={720}
  />
);
