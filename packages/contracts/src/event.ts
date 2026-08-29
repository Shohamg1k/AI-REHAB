import { z } from "zod";
import { CaptureQualitySchema } from "./pose.js";
import { RepEventSchema } from "./rep.js";
import { FormScoreSchema } from "./form.js";
import { CoachingCueSchema } from "./cue.js";
import { PainSignalSchema } from "./pain.js";
import { BodyRegionSchema } from "./exercise.js";
import { SafetyVerdictSchema } from "./safety.js";
import { AdaptationDecisionSchema } from "./adaptation.js";

/**
 * The append-only spine (G1). Everything else ends up here — every view in
 * the product is a projection over this log.
 *
 * Rules:
 * - Append-only. No updates, no deletes. Corrections are new events.
 * - `rep_completed` stores the derived RepEvent, not landmark frames.
 * - In the MVP this log lives in IndexedDB only (local-only G1); sync (G6)
 *   and server-side projections (G2) are fast-follow.
 */
export const SessionEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("session_started"),
    t: z.number(),
    sessionId: z.string(),
    programId: z.string().nullable(),
    wallClock: z.string()
  }),
  z.object({
    type: z.literal("setup_completed"),
    t: z.number(),
    captureQuality: CaptureQualitySchema
  }),
  z.object({
    type: z.literal("readiness_reported"),
    t: z.number(),
    energy: z.number(),
    painGeneral: z.number()
  }),
  z.object({
    type: z.literal("exercise_started"),
    t: z.number(),
    exerciseId: z.string(),
    prescribed: z.object({ sets: z.number().int().positive(), reps: z.number().int().positive() })
  }),
  z.object({
    type: z.literal("rep_completed"),
    t: z.number(),
    rep: RepEventSchema,
    score: FormScoreSchema
  }),
  z.object({
    type: z.literal("cue_delivered"),
    t: z.number(),
    cue: CoachingCueSchema
  }),
  z.object({
    type: z.literal("pain_reported"),
    t: z.number(),
    signal: PainSignalSchema
  }),
  z.object({
    type: z.literal("pain_bookmarked"),
    t: z.number(),
    repIndex: z.number().int().nonnegative(),
    region: BodyRegionSchema.nullable()
  }),
  z.object({
    type: z.literal("safety_verdict"),
    t: z.number(),
    verdict: SafetyVerdictSchema
  }),
  z.object({
    type: z.literal("exercise_completed"),
    t: z.number(),
    exerciseId: z.string(),
    repsCompleted: z.number().int().nonnegative()
  }),
  z.object({
    type: z.literal("adaptation_decided"),
    t: z.number(),
    decision: AdaptationDecisionSchema
  }),
  z.object({
    type: z.literal("session_ended"),
    t: z.number(),
    reason: z.enum(["completed", "abandoned", "blocked"])
  })
]);
export type SessionEvent = z.infer<typeof SessionEventSchema>;
export type SessionEventType = SessionEvent["type"];
