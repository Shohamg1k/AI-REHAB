import { checkSafetyRuleCoverage } from "./coverage.js";
import type { ReplayResult } from "./replay.js";
import { EXERCISES } from "@ai-rehab/exercises";

export function buildReport(results: readonly ReplayResult[]): string {
  const allFiredRuleIds = new Set(results.flatMap((r) => r.firedRuleIds));
  const coverage = checkSafetyRuleCoverage(EXERCISES, allFiredRuleIds);

  const passCount = results.filter((r) => r.passed).length;
  const lines: string[] = [];

  lines.push("# I2 — fixture replay report");
  lines.push("");
  lines.push(`**${passCount}/${results.length} fixtures passed.**`);
  lines.push("");
  lines.push("| Fixture | Exercise | Reps | Avg score | Safety rules fired | Result |");
  lines.push("|---|---|---|---|---|---|");
  for (const r of results) {
    const score = r.avgFormScore !== null ? r.avgFormScore.toFixed(1) : "—";
    const rules = r.firedRuleIds.length > 0 ? r.firedRuleIds.join(", ") : "—";
    lines.push(
      `| ${r.fixtureId} | ${r.exerciseId} | ${r.actualRepCount} | ${score} | ${rules} | ${r.passed ? "✅ pass" : "❌ FAIL"} |`
    );
  }

  const failing = results.filter((r) => !r.passed);
  if (failing.length > 0) {
    lines.push("");
    lines.push("## Failures");
    for (const r of failing) {
      lines.push(`- **${r.fixtureId}**: ${r.failures.join("; ")}`);
    }
  }

  lines.push("");
  lines.push("## Safety rule coverage (CLAUDE.md §4 — no fixture, no merge)");
  lines.push("");
  if (coverage.missing.length === 0) {
    lines.push(`Every configured veto-tier safety rule across all ${EXERCISES.length} exercises fires in at least one fixture.`);
  } else {
    lines.push("**Missing coverage — these configured rules never fire in any fixture:**");
    for (const ruleId of coverage.missing) lines.push(`- \`${ruleId}\``);
  }
  lines.push("");
  lines.push(`Covered: ${coverage.covered.map((id) => `\`${id}\``).join(", ") || "none"}`);

  return lines.join("\n");
}
