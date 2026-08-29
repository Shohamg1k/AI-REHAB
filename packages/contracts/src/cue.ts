import { z } from "zod";
import { JointNameSchema } from "./pose.js";

/** `urgency: 'stop'` may only be emitted by the safety gate (see safety.ts). */
export const CoachingCueSchema = z.object({
  t: z.number(),
  cueId: z.string(),
  text: z.string().min(1),
  targetJoint: JointNameSchema.nullable(),
  urgency: z.enum(["info", "correct", "stop"]),
  source: z.enum(["form", "safety", "narration"])
});
export type CoachingCue = z.infer<typeof CoachingCueSchema>;
