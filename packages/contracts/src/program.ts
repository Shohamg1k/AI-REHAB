import { z } from "zod";
import { BodyRegionSchema, IntensitySchema } from "./exercise.js";

/**
 * F6 (M2 slice) — a clinician's prescription for a patient: which
 * exercises, how many sets/reps. References `exerciseId` as a bare string
 * rather than importing `@ai-rehab/exercises` — contracts depends on
 * nothing, and the exercise catalogue is data the API doesn't need to
 * understand, only to pass through to the client that does.
 *
 * `targetRegions`/`intensity` are a snapshot the *client* supplies at
 * creation time (it has the full `ExerciseSpec` catalogue; `apps/api`
 * deliberately does not — see `docs/ARCHITECTURE.md` §3's dependency rule
 * and `scripts/lint-boundaries.mjs` rule 5). This is what feeds E5's
 * contraindicated-region check in `POST /programs` without apps/api ever
 * needing to know what an exercise actually is.
 */
export const ProgramExerciseSchema = z.object({
  exerciseId: z.string().min(1),
  targetRegions: z.array(BodyRegionSchema),
  intensity: IntensitySchema,
  sets: z.number().int().positive(),
  reps: z.number().int().positive(),
  sortOrder: z.number().int().nonnegative()
});
export type ProgramExercise = z.infer<typeof ProgramExerciseSchema>;

export const ProgramSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  patientId: z.string(),
  createdBy: z.string(),
  notes: z.string().nullable(),
  exercises: z.array(ProgramExerciseSchema),
  createdAt: z.string()
});
export type Program = z.infer<typeof ProgramSchema>;

export const CreateProgramRequestSchema = z.object({
  patientId: z.string(),
  notes: z.string().optional(),
  exercises: z.array(ProgramExerciseSchema.omit({ sortOrder: true })).min(1)
});
export type CreateProgramRequest = z.infer<typeof CreateProgramRequestSchema>;
