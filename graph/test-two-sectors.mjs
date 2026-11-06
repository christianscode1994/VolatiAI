import { buildGraphFromEnvelopes } from "./graph-builder.js";
import { arbitrate } from "../truth/arbitration-engine.js";

const SECTORS = [
  "https://sector-blockchain.fourieranalys.workers.dev",
  "https://sector-kryptovaluta.fourieranalys.workers.dev",
];

async function main() {
  const envelopes = await Promise.all(
    SECTORS.map(async url => {
      const r = await fetch(url + "/signal");
      return r.json();
    })
  );

  console.log("=== Envelopes ===");
  for (const e of envelopes) {
    console.log(`  ${e.sector}: confidence=${e.confidence.toFixed(2)} ` +
                `sources=${e.sources.total - (e.sources.failed?.length || 0)}/${e.sources.total}`);
  }

  const graph = buildGraphFromEnvelopes(envelopes);

  console.log("\n=== Graph ===");
  console.log(`nodes: ${graph.claim_count} claims + ${graph.source_count} sources`);
  console.log(`edges: ${graph.edges.length}`);

  const claims = arbitrate(graph);

  console.log("\n=== Arbitration (sorted by confidence) ===");
  claims.sort((a, b) => b.confidence - a.confidence);
  for (const c of claims) {
    console.log(`  ${c.claim.padEnd(45)} conf=${c.confidence.toFixed(3)} support=${c.support.toFixed(1)} disputes=${c.disputes.toFixed(1)}`);
  }

  if (claims.length !== 2) {
    console.error(`\nFAIL: expected 2 claims, got ${claims.length}`);
    process.exit(1);
  }

  console.log("\nPASS: multi-sector arbitration works");
}

main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
