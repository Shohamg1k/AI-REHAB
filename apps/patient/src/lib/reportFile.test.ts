import { describe, expect, it } from "vitest";
import type { ProgressReport } from "@ai-rehab/contracts";
import { reportFileName, reportTitle, reportToHtml } from "./reportFile.js";

const report = (overrides: Partial<ProgressReport> = {}): ProgressReport => ({
  patientId: "p1",
  patientDisplayName: "Asha Narang",
  periodStart: "2026-09-01T18:30:00.000Z",
  periodEnd: "2026-09-02T18:29:59.999Z",
  periodDate: "2026-09-02",
  timeZone: "Asia/Kolkata",
  lastActivityAt: "2026-09-02T04:00:00.000Z",
  sessionCount: 2,
  activeDays: 1,
  totalReps: 14,
  scoredReps: 14,
  avgFormScore: 90.6,
  exercisesPerformed: ["seated-knee-extension"],
  perExercise: [
    {
      exerciseId: "seated-knee-extension",
      sessions: 1,
      totalReps: 8,
      scoredReps: 8,
      avgFormScore: 88,
      completionRate: 1,
      criteria: [
        {
          criterionId: "tempo",
          label: "Movement tempo",
          reps: 8,
          failed: 2,
          warned: 0,
          avgValue: 1593.8,
          target: { min: 1500, max: 3500 },
          avgMissBy: 150
        }
      ],
      compensations: [
        { ruleId: "trunk_substitution", label: "Leaning back to lift", occurrences: 3, avgSeverity: 0.6 }
      ],
      romChange: [
        { joint: "left_knee", firstPeak: 121, lastPeak: 136, changeDeg: 15, sessions: 2 }
      ]
    }
  ],
  formTrend: [{ at: "2026-09-02T04:00:00.000Z", avgFormScore: 90.6, scoredReps: 14 }],
  dataQuality: { scoredRatio: 1, unscoredReps: 0, meanConfidence: 0.93 },
  adherence: [{ date: "2026-09-02", sessionCount: 2 }],
  pain: [
    { at: "2026-09-02T04:00:00.000Z", region: "knee", severity: 2, exerciseId: "seated-knee-extension", repIndex: 3 }
  ],
  observations: [
    { text: "2 sessions across 1 day.", basis: "Counted from synced session events.", exerciseId: null }
  ],
  ...overrides
});

describe("reportFileName", () => {
  /** What the user asked for: the patient's name and the day. */
  it("is the patient's name and the report's day", () => {
    expect(reportFileName(report(), "html")).toBe("asha-narang_2026-09-02.html");
    expect(reportFileName(report(), "pdf")).toBe("asha-narang_2026-09-02.pdf");
  });

  it("uses the report's own day, not the period start instant", () => {
    // East of UTC the period *begins* on the previous date — the file must be
    // named for the day the patient exercised, not for that instant.
    expect(reportFileName(report(), "html")).toContain("2026-09-02");
    expect(reportFileName(report(), "html")).not.toContain("2026-09-01");
  });

  it("falls back to the period start when there is no single day", () => {
    expect(reportFileName(report({ periodDate: null }), "html")).toBe(
      "asha-narang_2026-09-01.html"
    );
  });

  /**
   * A display name is whatever the patient typed. It becomes a filename, so
   * anything that could break a path, or produce an empty one, is flattened.
   */
  it("produces a safe filename from an awkward display name", () => {
    const cases: Array<[string, string]> = [
      ["José Álvarez-Núñez", "jose-alvarez-nunez"],
      ["  Dr. Ruth   O'Neill  ", "dr-ruth-o-neill"],
      ["../../etc/passwd", "etc-passwd"],
      ["😀😀😀", "patient"],
      ["", "patient"]
    ];
    for (const [displayName, expected] of cases) {
      expect(reportFileName(report({ patientDisplayName: displayName }), "html"), displayName).toBe(
        `${expected}_2026-09-02.html`
      );
    }
  });
});

describe("reportToHtml", () => {
  it("is a standalone document with no external references", () => {
    const html = reportToHtml(report());
    expect(html.startsWith("<!doctype html>")).toBe(true);
    // No stylesheet, script, image or font to fetch: it has to open from a
    // downloads folder, offline, years later.
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("carries the findings, not just the totals", () => {
    const html = reportToHtml(report());
    expect(html).toContain("Movement tempo");
    expect(html).toContain("Leaning back to lift");
    expect(html).toContain("Seated Knee Extension"); // resolved display name
    expect(html).toContain("121°");
    expect(html).toContain("136°");
  });

  it("keeps the non-diagnostic framing", () => {
    // CLAUDE.md §6 — this survives into anything a clinician files or prints.
    expect(reportToHtml(report())).toMatch(/not a medical device/i);
  });

  it("says which clock the days were counted in", () => {
    expect(reportToHtml(report())).toContain("Asia/Kolkata");
  });

  /**
   * The display name is user-supplied and this file gets opened in a browser —
   * the one place a stored script would actually execute. There is no
   * framework escaping in a hand-built string, so it is done explicitly.
   */
  it("escapes user-supplied text rather than interpolating it raw", () => {
    const html = reportToHtml(
      report({ patientDisplayName: '<script>alert("xss")</script> & "friends"' })
    );
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
    // The title attribute is built from the same value.
    expect(html).not.toMatch(/<title>[^<]*<script/);
  });

  it("escapes an exercise label that came from the event log", () => {
    const evil = report();
    evil.perExercise[0]!.criteria[0]!.label = '</h3><img src=x onerror="alert(1)">';
    const html = reportToHtml(evil);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;/h3&gt;");
  });

  it("survives an empty day without producing broken sections", () => {
    const empty = reportToHtml(
      report({
        perExercise: [],
        pain: [],
              observations: [],
        avgFormScore: null,
        sessionCount: 0,
        totalReps: 0,
        scoredReps: 0
      })
    );
    expect(empty).toContain("Asha Narang");
    expect(empty).not.toContain("Exercise by exercise");
    expect(empty).not.toContain("undefined");
    expect(empty).not.toContain("NaN");
  });
});

describe("reportTitle", () => {
  /**
   * Asserted by structure, not by string.
   *
   * The first version pinned "Wednesday, 2 September 2026", which is what a
   * en-GB runtime produces — the CI runner is en-US and says "Wednesday,
   * September 2, 2026". The title is deliberately formatted in the reader's
   * locale, so the test must check what this function decides (the name, the
   * separator, the right day) and not what Intl decides.
   */
  it("names the patient and the day in words", () => {
    const title = reportTitle(report());
    expect(title.startsWith("Asha Narang — ")).toBe(true);

    const formatted = new Date("2026-09-02T12:00:00Z").toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    });
    expect(title).toBe(`Asha Narang — ${formatted}`);
    // Whatever the locale's order, it is the report's own day.
    expect(title).toContain("2026");
  });

  it("uses the report's day rather than the period start instant", () => {
    // The period begins on 1 September UTC; the report is for the 2nd.
    const title = reportTitle(report());
    const first = new Date("2026-09-01T12:00:00Z").toLocaleDateString(undefined, {
      weekday: "long",
      timeZone: "UTC"
    });
    expect(title).not.toContain(first);
  });
});
