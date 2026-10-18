// graph/test-graph-builder.mjs
// Fetches sector-blockchain envelope, builds graph, runs arbitration.
// Expected values derived from actual envelope (not hardcoded).

import { buildGraphFromEnvelopes } from "./graph-builder.js";
import { arbitrate } from "../truth/arbitration-engine.js";

const SECTOR_URL = "https://sector-blockchain.fourieranalys.workers.dev";

async function main() {
  console.log("Fetching", SECTOR_URL + "/signal");

  const r = await fetch(SECTOR_URL + "/signal");
  if (!r.ok) {
    console.error("Failed to fetch envelope:", r.status);
    process.exit(1);
  }
  const envelope = await r.json();

  console.log("\n=== Envelope ===");
  console.log(JSON.stringify({
    sector: envelope.sector,
    has_signal: envelope.has_signal,
    summary: envelope.summary,
    confidence: envelope.confidence,
    sources: envelope.sources,
  }, null, 2));

  const graph = buildGraphFromEnvelopes([envelope]);

  console.log("\n=== Graph ===");
  console.log("nodes:", graph.claim_count, "claims +", graph.source_count, "sources");
  console.log("edges:", graph.edges.length);

  const result = arbitrate(graph);

  console.log("\n=== Arbitration ===");
  console.log(JSON.stringify(result, null, 2));

  if (result.length !== 1) {
    console.error("\nFAIL: expected exactly 1 arbitration result");
    process.exit(1);
  }

  const arbitration = result[0];

  // Derive expected values from actual envelope
  const failedCount = envelope.sources.failed?.length || 0;
  const healthyCount = envelope.sources.total - failedCount;
  const expectedSupport = healthyCount * 1.0;
  const expectedDisputes = failedCount * 0.5;
  const expectedConfidence =
    expectedSupport / Math.max(expectedSupport + expectedDisputes, 1);

  console.log("\n=== Check ===");
  console.log("claim:", arbitration.claim);
  console.log("support:", arbitration.support, "(expect " + expectedSupport + ")");
  console.log("disputes:", arbitration.disputes, "(expect " + expectedDisputes + ")");
  console.log(
    "confidence:",
    arbitration.confidence.toFixed(3),
    "(expect " + expectedConfidence.toFixed(3) + ")"
  );

  const pass =
    Math.abs(arbitration.support - expectedSupport) < 0.001 &&
    Math.abs(arbitration.disputes - expectedDisputes) < 0.001 &&
    Math.abs(arbitration.confidence - expectedConfidence) < 0.001;

  if (!pass) {
    console.error("\nFAIL: arbitration numbers don't match expected");
    process.exit(1);
  }

  console.log("\nPASS: graph + arbitration work end-to-end");
}

main().catch(e => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
