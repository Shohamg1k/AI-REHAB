import { z } from "zod";
import { SessionEventSchema } from "./event.js";

/**
 * G6 — local-first write with background sync. The patient app writes to
 * IndexedDB immediately (unchanged from M1) and flushes a batch here
 * opportunistically. Every `SessionEvent` in the batch is already the
 * derived-data-only shape the fast loop produces — this boundary carries
 * nothing new in kind, only in destination.
 *
 * Idempotent by design: `seq` is the event's position within the session as
 * the client produced it, so retrying an unacknowledged batch (flaky
 * connection, app closed mid-flush) upserts rather than duplicates. See
 * apps/api/src/store — `appendEvents` de-duplicates on
 * (userId, sessionId, seq).
 */
export const SyncEventSchema = z.object({
  seq: z.number().int().nonnegative(),
  event: SessionEventSchema
});
export type SyncEvent = z.infer<typeof SyncEventSchema>;

export const SyncRequestSchema = z.object({
  sessionId: z.string().min(1),
  events: z.array(SyncEventSchema).min(1).max(2000)
});
export type SyncRequest = z.infer<typeof SyncRequestSchema>;

export const SyncResponseSchema = z.object({
  inserted: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative()
});
export type SyncResponse = z.infer<typeof SyncResponseSchema>;

/** One row of the patient's session list (G2 projection). */
export const SessionSummarySchema = z.object({
  sessionId: z.string(),
  wallClock: z.string().nullable(),
  exerciseIds: z.array(z.string()),
  repCount: z.number().int().nonnegative(),
  avgFormScore: z.number().nullable(),
  endedReason: z.enum(["completed", "abandoned", "blocked"]).nullable()
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

/** G2 adherence projection — one row per calendar day with any session activity. */
export const AdherenceDaySchema = z.object({
  date: z.string(), // YYYY-MM-DD
  sessionCount: z.number().int().nonnegative()
});
export type AdherenceDay = z.infer<typeof AdherenceDaySchema>;

/**
 * A8 (computed form) — the patient's first-ever synced peak angle per
 * joint per exercise, used as a reference point for later trend views.
 * Derived from stored events on read rather than captured through a
 * dedicated client flow — see docs/STATUS.md for the scope note on why.
 */
export const BaselineEntrySchema = z.object({
  exerciseId: z.string(),
  joint: z.string(),
  peakAngle: z.number(),
  recordedAt: z.string()
});
export type BaselineEntry = z.infer<typeof BaselineEntrySchema>;

/**
 * G2's range-of-motion trend: one point per session per (exercise, joint),
 * the session's best peak angle for that joint — a session's best rep
 * represents the ROM actually achieved that visit, not every rep's noise.
 * Unlike `BaselineEntry` (a single first-ever reference point), this is a
 * real time series, so it can show whether ROM is improving.
 */
export const RomTrendPointSchema = z.object({
  recordedAt: z.string(),
  peakAngle: z.number()
});
export type RomTrendPoint = z.infer<typeof RomTrendPointSchema>;

export const RomTrendSeriesSchema = z.object({
  exerciseId: z.string(),
  joint: z.string(),
  points: z.array(RomTrendPointSchema)
});
export type RomTrendSeries = z.infer<typeof RomTrendSeriesSchema>;
