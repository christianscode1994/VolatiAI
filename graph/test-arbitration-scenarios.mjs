import { buildGraphFromEnvelopes } from "./graph-builder.js";
import { arbitrate } from "../truth/arbitration-engine.js";

function makeEnvelope(sector, total, failed) {
  return {
    sector,
    has_signal: true,
    density: "dense",
    severity: "notice",
    summary: "test signal",
    confidence: (total - failed.length) / total,
    timestamp: new Date().toISOString(),
    sources: { total, healthy: total - failed.length, failed },
  };
}

const scenarios = [
  { name: "all healthy", env: makeEnvelope("test-a", 3, []) },
  { name: "one failed", env: makeEnvelope("test-b", 3, ["x"]) },
  { name: "two failed", env: makeEnvelope("test-c", 3, ["x", "y"]) },
  { name: "all failed", env: makeEnvelope("test-d", 3, ["x", "y", "z"]) },
];

console.log("=== Arbitration scenarios ===\n");

let allPass = true;
for (const s of scenarios) {
  const graph = buildGraphFromEnvelopes([s.env]);
  const [arb] = arbitrate(graph);
  const failed = s.env.sources.failed.length;
  const healthy = s.env.sources.total - failed;
  const expectedSupport = healthy * 1.0;
  const expectedDisputes = failed * 0.5;
  const expectedConf = expectedSupport / Math.max(expectedSupport + expectedDisputes, 1);
  const pass = Math.abs(arb.confidence - expectedConf) < 0.001;

  console.log(`${s.name.padEnd(15)} failed=${failed} support=${arb.support.toFixed(1)} disputes=${arb.disputes.toFixed(1)} confidence=${arb.confidence.toFixed(3)} ${pass ? "✓" : "✗"}`);
  if (!pass) allPass = false;
}

console.log(allPass ? "\nPASS: all scenarios correct" : "\nFAIL");
process.exit(allPass ? 0 : 1);
