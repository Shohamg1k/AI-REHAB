import { describe, expect, it } from "vitest";
import type { SessionEvent } from "@ai-rehab/contracts";
import { computeDailyReports } from "./projections.js";
import {
  computeDataQuality,
  computeExerciseSummaries,
  computeFormTrend,
  missBy,
  type SessionWithEvents
} from "./reportDepth.js";

/**
 * F1 depth. These are written against event logs shaped like the ones the
 * patient app actually emits, because the whole point of the change is that
 * the clinically useful detail was already in those events and the report was
 * averaging it away.
 */

const repEvent = (opts: {
  index: number;
  score: number;
  confidence: number;
  /** [value, min, max, status] for the one criterion under test. */
  romValue?: number;
  romStatus?: "ok" | "warn" | "fail";
  peakKnee?: number;
  compensation?: { ruleId: string; label: string; severity: number };
}): SessionEvent =>
  ({
    type: "rep_completed",
    t: opts.index * 1000,
    rep: {
      t: opts.index * 1000,
      repIndex: opts.index,
      setIndex: 0,
      phaseTimings: {},
      peakAngles: opts.peakKnee === undefined ? {} : { left_knee: opts.peakKnee },
      endAngles: {},
      tempoMs: 2000,
      meanConfidence: opts.confidence
    },
    score: {
      t: opts.index * 1000,
      repIndex: opts.index,
      score: opts.score,
      breakdown:
        opts.romValue === undefined
          ? []
          : [
              {
                criterionId: "knee_rom",
                label: "Knee extension range",
                value: opts.romValue,
                target: { min: 130, max: 180 },
                status: opts.romStatus ?? "ok",
                contribution: 1
              }
            ],
      compensations: opts.compensation ? [opts.compensation] : [],
      confidence: opts.confidence,
      reason: "test"
    }
  }) as SessionEvent;

const started = (exerciseId: string, sets = 1, reps = 8): SessionEvent =>
  ({ type: "exercise_started", t: 0, exerciseId, prescribed: { sets, reps } }) as SessionEvent;

const session = (sessionId: string, startedAt: string, events: SessionEvent[]): SessionWithEvents => ({
  sessionId,
  startedAt,
  events
});

describe("missBy", () => {
  it("measures distance outside the band and nothing inside it", () => {
    expect(missBy(118, { min: 130, max: 180 })).toBe(12);
    expect(missBy(190, { min: 130, max: 180 })).toBe(10);
    expect(missBy(140, { min: 130, max: 180 })).toBe(0);
  });
});

describe("computeExerciseSummaries", () => {
  it("names which criterion failed, how often, and by how much", () => {
    const [summary] = computeExerciseSummaries([
      session("s1", "2026-09-01T10:00:00Z", [
        started("seated-knee-extension"),
        repEvent({ index: 0, score: 60, confidence: 0.9, romValue: 118, romStatus: "fail" }),
        repEvent({ index: 1, score: 62, confidence: 0.9, romValue: 122, romStatus: "fail" }),
        repEvent({ index: 2, score: 95, confidence: 0.9, romValue: 140, romStatus: "ok" })
      ])
    ]);

    expect(summary?.exerciseId).toBe("seated-knee-extension");
    const criterion = summary!.criteria[0]!;
    expect(criterion.label).toBe("Knee extension range");
    expect(criterion.reps).toBe(3);
    expect(criterion.failed).toBe(2);
    // (130-118 + 130-122) / 2 — averaged over the reps that actually missed,
    // not over all reps, so it reads as "when they miss, they miss by this".
    expect(criterion.avgMissBy).toBe(10);
    expect(criterion.avgValue).toBe(126.7);
  });

  /**
   * G7, one level deeper than the average. A rep the tracker could barely see
   * must not produce a confident-looking "failed" against a criterion it never
   * really measured.
   */
  it("excludes unscored reps from criterion statistics but still counts them", () => {
    const [summary] = computeExerciseSummaries([
      session("s1", "2026-09-01T10:00:00Z", [
        started("seated-knee-extension"),
        repEvent({ index: 0, score: 90, confidence: 0.9, romValue: 140, romStatus: "ok" }),
        repEvent({ index: 1, score: 10, confidence: 0.2, romValue: 40, romStatus: "fail" })
      ])
    ]);

    expect(summary!.totalReps).toBe(2);
    expect(summary!.scoredReps).toBe(1);
    expect(summary!.criteria[0]!.reps).toBe(1);
    expect(summary!.criteria[0]!.failed).toBe(0);
  });

  it("sorts criteria worst-first", () => {
    const events = [
      started("x"),
      {
        ...(repEvent({ index: 0, score: 50, confidence: 0.9 }) as Record<string, unknown>),
        score: {
          t: 0,
          repIndex: 0,
          score: 50,
          breakdown: [
            { criterionId: "a", label: "A", value: 1, target: { min: 0, max: 10 }, status: "ok", contribution: 1 },
            { criterionId: "b", label: "B", value: 99, target: { min: 0, max: 10 }, status: "fail", contribution: 1 }
          ],
          compensations: [],
          confidence: 0.9,
          reason: "t"
        }
      } as unknown as SessionEvent
    ];
    const [summary] = computeExerciseSummaries([session("s1", "2026-09-01T10:00:00Z", events)]);
    expect(summary!.criteria.map((c) => c.criterionId)).toEqual(["b", "a"]);
  });

/**
   * Regression: the tie-break used to be `avgMissBy`, which ranked a 600ms
   * tempo miss above an 8.2° range miss — comparing milliseconds to degrees.
   * Criteria carry different units, so the ordering must not depend on
   * magnitude. Equal failure rates now order deterministically by id.
   */
  it("does not rank criteria by a magnitude measured in different units", () => {
    const breakdown = (rom: number, tempo: number, romStatus: string, tempoStatus: string) => ({
      t: 0,
      repIndex: 0,
      score: 50,
      breakdown: [
        { criterionId: "tempo", label: "Tempo", value: tempo, target: { min: 1500, max: 3500 }, status: tempoStatus, contribution: 1 },
        { criterionId: "knee_rom", label: "Range", value: rom, target: { min: 130, max: 180 }, status: romStatus, contribution: 1 }
      ],
      compensations: [],
      confidence: 0.9,
      reason: "t"
    });
    const rep = (i: number, rom: number, tempo: number, rs: string, ts: string) =>
      ({
        type: "rep_completed",
        t: i * 1000,
        rep: { t: i * 1000, repIndex: i, setIndex: 0, phaseTimings: {}, peakAngles: {}, endAngles: {}, tempoMs: tempo, meanConfidence: 0.9 },
        score: breakdown(rom, tempo, rs, ts)
      }) as unknown as SessionEvent;

    const [summary] = computeExerciseSummaries([
      session("s1", "2026-09-01T10:00:00Z", [
        started("x"),
        // Both criteria fail on exactly the same number of reps. Tempo misses
        // by 600 (ms), range by 12 (degrees).
        rep(0, 118, 900, "fail", "fail"),
        rep(1, 118, 900, "fail", "fail"),
        rep(2, 140, 2200, "ok", "ok")
      ])
    ]);

    const ids = summary!.criteria.map((c) => c.criterionId);
    expect(ids).toEqual(["knee_rom", "tempo"]);
    // Both are surfaced with their own units intact.
    expect(summary!.criteria.find((c) => c.criterionId === "tempo")!.avgMissBy).toBe(600);
    expect(summary!.criteria.find((c) => c.criterionId === "knee_rom")!.avgMissBy).toBe(12);
  });

  it("aggregates named compensation patterns", () => {
    const compensation = { ruleId: "trunk_substitution", label: "Using the back", severity: 0.6 };
    const [summary] = computeExerciseSummaries([
      session("s1", "2026-09-01T10:00:00Z", [
        started("sit-to-stand"),
        repEvent({ index: 0, score: 70, confidence: 0.9, compensation }),
        repEvent({ index: 1, score: 70, confidence: 0.9, compensation })
      ])
    ]);
    expect(summary!.compensations[0]).toEqual({
      ruleId: "trunk_substitution",
      label: "Using the back",
      occurrences: 2,
      avgSeverity: 0.6
    });
  });

  it("reports range of motion as first session's best against the last session's best", () => {
    const [summary] = computeExerciseSummaries([
      session("s1", "2026-09-01T10:00:00Z", [
        started("seated-knee-extension"),
        repEvent({ index: 0, score: 60, confidence: 0.9, peakKnee: 118 }),
        repEvent({ index: 1, score: 60, confidence: 0.9, peakKnee: 124 })
      ]),
      session("s2", "2026-09-05T10:00:00Z", [
        started("seated-knee-extension"),
        repEvent({ index: 0, score: 80, confidence: 0.9, peakKnee: 131 }),
        repEvent({ index: 1, score: 80, confidence: 0.9, peakKnee: 139 })
      ])
    ]);
    // Best of first (124) against best of last (139) — peak, because peak is
    // what the exercise trains.
    expect(summary!.romChange[0]).toMatchObject({
      joint: "left_knee",
      firstPeak: 124,
      lastPeak: 139,
      changeDeg: 15,
      sessions: 2
    });
  });

  it("does not claim a range change from a single session", () => {
    const [summary] = computeExerciseSummaries([
      session("s1", "2026-09-01T10:00:00Z", [
        started("seated-knee-extension"),
        repEvent({ index: 0, score: 60, confidence: 0.9, peakKnee: 118 })
      ])
    ]);
    expect(summary!.romChange).toEqual([]);
  });

  /** Range of motion is geometry, measurable even on a rep too noisy to score. */
  it("measures range of motion from unscored reps too", () => {
    const [summary] = computeExerciseSummaries([
      session("s1", "2026-09-01T10:00:00Z", [
        started("x"),
        repEvent({ index: 0, score: 0, confidence: 0.1, peakKnee: 100 })
      ]),
      session("s2", "2026-09-02T10:00:00Z", [
        started("x"),
        repEvent({ index: 0, score: 0, confidence: 0.1, peakKnee: 120 })
      ])
    ]);
    expect(summary!.scoredReps).toBe(0);
    expect(summary!.romChange[0]?.changeDeg).toBe(20);
  });

  it("reports completion against what was prescribed", () => {
    const [summary] = computeExerciseSummaries([
      session("s1", "2026-09-01T10:00:00Z", [
        started("sit-to-stand", 1, 8),
        ...Array.from({ length: 4 }, (_, i) =>
          repEvent({ index: i, score: 80, confidence: 0.9 })
        )
      ])
    ]);
    expect(summary!.completionRate).toBe(0.5);
  });

  it("has no completion rate when nothing was prescribed", () => {
    const [summary] = computeExerciseSummaries([
      session("s1", "2026-09-01T10:00:00Z", [
        started("x", 0, 0),
        repEvent({ index: 0, score: 80, confidence: 0.9 })
      ])
    ]);
    expect(summary!.completionRate).toBeNull();
  });

  it("keeps exercises separate within one session", () => {
    const summaries = computeExerciseSummaries([
      session("s1", "2026-09-01T10:00:00Z", [
        started("a"),
        repEvent({ index: 0, score: 90, confidence: 0.9 }),
        started("b"),
        repEvent({ index: 1, score: 40, confidence: 0.9 })
      ])
    ]);
    expect(summaries.find((s) => s.exerciseId === "a")?.avgFormScore).toBe(90);
    expect(summaries.find((s) => s.exerciseId === "b")?.avgFormScore).toBe(40);
  });
});

describe("computeFormTrend", () => {
  it("gives one point per session, oldest first, scored reps only", () => {
    const trend = computeFormTrend([
      session("s2", "2026-09-05T10:00:00Z", [
        started("x"),
        repEvent({ index: 0, score: 90, confidence: 0.9 })
      ]),
      session("s1", "2026-09-01T10:00:00Z", [
        started("x"),
        repEvent({ index: 0, score: 60, confidence: 0.9 }),
        repEvent({ index: 1, score: 0, confidence: 0.1 })
      ])
    ]);
    expect(trend).toEqual([
      { at: "2026-09-01T10:00:00Z", avgFormScore: 60, scoredReps: 1 },
      { at: "2026-09-05T10:00:00Z", avgFormScore: 90, scoredReps: 1 }
    ]);
  });

  it("omits a session in which nothing could be scored", () => {
    expect(
      computeFormTrend([
        session("s1", "2026-09-01T10:00:00Z", [
          started("x"),
          repEvent({ index: 0, score: 0, confidence: 0.1 })
        ])
      ])
    ).toEqual([]);
  });
});

describe("computeDataQuality", () => {
  it("says how much of the movement was actually visible", () => {
    expect(
      computeDataQuality([
        session("s1", "2026-09-01T10:00:00Z", [
          started("x"),
          repEvent({ index: 0, score: 90, confidence: 0.9 }),
          repEvent({ index: 1, score: 90, confidence: 0.9 }),
          repEvent({ index: 2, score: 10, confidence: 0.3 }),
          repEvent({ index: 3, score: 10, confidence: 0.1 })
        ])
      ])
    ).toEqual({ scoredRatio: 0.5, unscoredReps: 2, meanConfidence: 0.55 });
  });

  it("is honest about an empty period rather than reporting a perfect ratio", () => {
    expect(computeDataQuality([])).toEqual({
      scoredRatio: 0,
      unscoredReps: 0,
      meanConfidence: null
    });
  });
});

/**
 * F1 daily reports. The requested behaviour is "one report per day, and if a
 * report is already there it picks up whatever else you do that day" — which
 * falls out of deriving on read rather than storing, so what these pin is that
 * the day boundary is right and that a second session folds into the same day.
 */
describe("computeDailyReports", () => {
  const stored = (sessionId: string, wallClock: string, events: SessionEvent[]) => ({
    sessionId,
    events: [
      { seq: 0, event: { type: "session_started", t: 0, sessionId, programId: null, wallClock } as SessionEvent },
      ...events.map((event, i) => ({ seq: i + 1, event }))
    ]
  });

  const period = { periodStart: "2026-08-01T00:00:00.000Z", periodEnd: "2026-09-30T00:00:00.000Z" };
  const input = { patientId: "p1", patientDisplayName: "Asha", ...period };

  it("returns one report per active day, newest first", () => {
    const reports = computeDailyReports(
      [
        stored("a", "2026-09-01T09:00:00.000Z", [started("x"), repEvent({ index: 0, score: 80, confidence: 0.9 })]),
        stored("b", "2026-09-03T09:00:00.000Z", [started("x"), repEvent({ index: 0, score: 90, confidence: 0.9 })])
      ],
      input
    );
    expect(reports.map((r) => r.periodStart.slice(0, 10))).toEqual(["2026-09-03", "2026-09-01"]);
  });

  /**
   * The requested behaviour, stated directly: a second session on the same day
   * does not make a second report — it makes the day's one report say more.
   */
  it("folds a later session into the same day's report rather than adding another", () => {
    const morning = stored("am", "2026-09-01T09:00:00.000Z", [
      started("seated-knee-extension"),
      repEvent({ index: 0, score: 80, confidence: 0.9 })
    ]);
    const evening = stored("pm", "2026-09-01T19:30:00.000Z", [
      started("sit-to-stand"),
      repEvent({ index: 0, score: 60, confidence: 0.9 }),
      repEvent({ index: 1, score: 60, confidence: 0.9 })
    ]);

    const before = computeDailyReports([morning], input);
    expect(before).toHaveLength(1);
    expect(before[0]!.totalReps).toBe(1);
    expect(before[0]!.exercisesPerformed).toEqual(["seated-knee-extension"]);

    const after = computeDailyReports([morning, evening], input);
    expect(after).toHaveLength(1);
    expect(after[0]!.totalReps).toBe(3);
    expect(after[0]!.exercisesPerformed).toEqual(["seated-knee-extension", "sit-to-stand"]);
    expect(after[0]!.sessionCount).toBe(2);
  });

  it("moves lastActivityAt forward as the day goes on", () => {
    const morning = stored("am", "2026-09-01T09:00:00.000Z", [
      started("x"),
      repEvent({ index: 0, score: 80, confidence: 0.9 })
    ]);
    const evening = stored("pm", "2026-09-01T19:30:00.000Z", [
      started("x"),
      repEvent({ index: 0, score: 80, confidence: 0.9 })
    ]);

    expect(computeDailyReports([morning], input)[0]!.lastActivityAt).toBe("2026-09-01T09:00:00.000Z");
    expect(computeDailyReports([morning, evening], input)[0]!.lastActivityAt).toBe(
      "2026-09-01T19:30:00.000Z"
    );
  });

  it("omits days with no sessions rather than returning empty reports", () => {
    const reports = computeDailyReports(
      [stored("a", "2026-09-01T09:00:00.000Z", [started("x"), repEvent({ index: 0, score: 80, confidence: 0.9 })])],
      input
    );
    // A month-long window, one active day.
    expect(reports).toHaveLength(1);
  });

  it("ignores sessions outside the window", () => {
    const reports = computeDailyReports(
      [stored("old", "2026-01-01T09:00:00.000Z", [started("x"), repEvent({ index: 0, score: 80, confidence: 0.9 })])],
      input
    );
    expect(reports).toEqual([]);
  });

  it("keeps each day's numbers to that day", () => {
    const reports = computeDailyReports(
      [
        stored("a", "2026-09-01T09:00:00.000Z", [started("x"), repEvent({ index: 0, score: 40, confidence: 0.9 })]),
        stored("b", "2026-09-02T09:00:00.000Z", [
          started("x"),
          repEvent({ index: 0, score: 100, confidence: 0.9 }),
          repEvent({ index: 1, score: 100, confidence: 0.9 })
        ])
      ],
      input
    );
    const [sep2, sep1] = reports;
    expect(sep2!.avgFormScore).toBe(100);
    expect(sep2!.totalReps).toBe(2);
    expect(sep1!.avgFormScore).toBe(40);
    expect(sep1!.totalReps).toBe(1);
  });
});
