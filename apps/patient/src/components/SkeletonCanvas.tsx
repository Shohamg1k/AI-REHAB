import { useEffect, useRef } from "react";
import type { Landmark } from "@ai-rehab/contracts";

/**
 * Renders a stick-figure skeleton derived from landmarks — never the camera
 * frame itself (ADR-0002, docs/UX-SPEC.md §1: "the camera view renders a
 * skeleton, never a video frame or a recorded clip"). This is the only
 * thing on screen backed by the camera; the `<video>` element that actually
 * captures it (hooks/useLiveSession.ts) is never rendered visibly.
 *
 * Mirrored horizontally (selfie-view convention) for display only — the
 * underlying angle math in packages/core operates on raw, unmirrored
 * MediaPipe coordinates and is unaffected by this.
 */

// A trimmed MediaPipe POSE_CONNECTIONS — body only, no face/hand detail.
const CONNECTIONS: Array<[number, number]> = [
  [11, 12], // shoulders
  [11, 13],
  [13, 15], // left arm
  [12, 14],
  [14, 16], // right arm
  [11, 23],
  [12, 24], // shoulder -> hip
  [23, 24], // hips
  [23, 25],
  [25, 27], // left leg
  [24, 26],
  [26, 28], // right leg
  [27, 29],
  [27, 31], // left foot
  [28, 30],
  [28, 32] // right foot
];

export function SkeletonCanvas({
  landmarks,
  className = ""
}: {
  landmarks: Landmark[] | null;
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

    const toScreen = (l: Landmark): [number, number] => [(1 - l.x) * width, l.y * height];

    ctx.strokeStyle = "#0EA5A5";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    for (const [a, b] of CONNECTIONS) {
      const la = landmarks[a];
      const lb = landmarks[b];
      if (!la || !lb || la.visibility < 0.4 || lb.visibility < 0.4) continue;
      const [ax, ay] = toScreen(la);
      const [bx, by] = toScreen(lb);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }

    ctx.fillStyle = "#F59E0B";
    const jointIndices = new Set(CONNECTIONS.flat());
    for (const idx of jointIndices) {
      const l = landmarks[idx];
      if (!l || l.visibility < 0.4) continue;
      const [x, y] = toScreen(l);
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [landmarks]);

  return (
    <canvas
      ref={canvasRef}
      width={640}
      height={480}
      className={`bg-inverse rounded-lg w-full h-full ${className}`}
      aria-label="Live pose skeleton"
    />
  );
}
