import { useEffect, useRef } from "react";
import { POSE_LANDMARK_INDEX, type Landmark, type LandmarkCheck } from "@ai-rehab/contracts";

/**
 * Draws the detected skeleton on a transparent canvas, sized to sit exactly
 * on top of the live `<video>`.
 *
 * This is an *overlay*, not a replacement. The patient sees themselves; the
 * skeleton shows what the system is tracking. Earlier this component was the
 * only thing rendered (the video element was kept offscreen), which meant a
 * patient could not tell whether they were in frame — the problem this
 * change set exists to fix.
 *
 * Landmarks this exercise requires are drawn emphasised, and turn amber when
 * they are the reason tracking is degraded, so "what needs to be visible" is
 * legible at a glance rather than only in text.
 */

const CONNECTIONS: Array<[number, number]> = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
  [27, 29],
  [27, 31],
  [28, 30],
  [28, 32]
];

const MIN_DRAW_VISIBILITY = 0.4;

const COLOR = {
  requiredOk: "#14E3C8",
  requiredBad: "#FBBF24",
  incidental: "rgba(226, 232, 240, 0.35)",
  jointOk: "#14E3C8",
  jointBad: "#FBBF24"
} as const;

export function SkeletonOverlay({
  landmarks,
  landmarkChecks,
  className = ""
}: {
  landmarks: Landmark[] | null;
  /** Per-required-landmark status from framing. Drives emphasis. */
  landmarkChecks?: readonly LandmarkCheck[];
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    if (!landmarks || landmarks.length === 0) return;

    const requiredIndices = new Map<number, boolean>();
    for (const check of landmarkChecks ?? []) {
      requiredIndices.set(POSE_LANDMARK_INDEX[check.landmark], check.status === "ok");
    }

    // The video is mirrored for a natural selfie view, so x is flipped here
    // to match. Angle maths upstream uses the unmirrored coordinates.
    const toScreen = (l: Landmark): [number, number] => [(1 - l.x) * width, l.y * height];

    ctx.lineCap = "round";
    for (const [a, b] of CONNECTIONS) {
      const la = landmarks[a];
      const lb = landmarks[b];
      if (!la || !lb) continue;
      if (la.visibility < MIN_DRAW_VISIBILITY || lb.visibility < MIN_DRAW_VISIBILITY) continue;

      const aRequired = requiredIndices.has(a);
      const bRequired = requiredIndices.has(b);
      const isRequiredEdge = aRequired && bRequired;
      const edgeOk = (requiredIndices.get(a) ?? true) && (requiredIndices.get(b) ?? true);

      if (isRequiredEdge) {
        ctx.strokeStyle = edgeOk ? COLOR.requiredOk : COLOR.requiredBad;
        ctx.lineWidth = 5;
        ctx.shadowColor = edgeOk ? COLOR.requiredOk : COLOR.requiredBad;
        ctx.shadowBlur = 12;
      } else {
        ctx.strokeStyle = COLOR.incidental;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 0;
      }

      const [ax, ay] = toScreen(la);
      const [bx, by] = toScreen(lb);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Only required landmarks get a joint dot — incidental ones stay quiet
    // so the emphasis reads as "this is what I'm watching".
    for (const [index, ok] of requiredIndices) {
      const l = landmarks[index];
      if (!l || l.visibility < MIN_DRAW_VISIBILITY) continue;
      const [x, y] = toScreen(l);

      ctx.fillStyle = ok ? COLOR.jointOk : COLOR.jointBad;
      ctx.shadowColor = ok ? COLOR.jointOk : COLOR.jointBad;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [landmarks, landmarkChecks]);

  return (
    <canvas
      ref={canvasRef}
      width={640}
      height={480}
      className={`absolute inset-0 h-full w-full ${className}`}
      aria-hidden
    />
  );
}
