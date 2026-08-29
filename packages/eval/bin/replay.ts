#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FIXTURES } from "../src/synth/fixtures.js";
import { replayAll } from "../src/replay.js";
import { buildReport } from "../src/report.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const results = replayAll(FIXTURES);
const report = buildReport(results);

console.log(report);

const outPath = join(__dirname, "..", "report.md");
writeFileSync(outPath, report, "utf8");
console.log(`\nWrote ${outPath}`);

const failed = results.filter((r) => !r.passed);
if (failed.length > 0) {
  console.error(`\n${failed.length}/${results.length} fixture(s) failed.`);
  process.exit(1);
}
