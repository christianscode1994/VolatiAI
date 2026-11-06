import { buildGraphFromEnvelopes } from "./graph-builder.js";
import { arbitrate } from "../truth/arbitration-engine.js";

const SECTORS = ["blockchain", "kryptovaluta", "finance", "currency-ex", "weather", "develop"];

async function main() {
  const envelopes = await Promise.all(
    SECTORS.map(async s => {
      try {
        const r = await fetch(`https://sector-${s}.fourieranalys.workers.dev/signal`);
        return await r.json();
      } catch { return null; }
    })
  );

  const valid = envelopes.filter(e => e && e.sector);
  console.log(`=== ${valid.length}/${SECTORS.length} envelopes ===`);
  for (const e of valid) {
    console.log(`  ${e.sector.padEnd(15)} ${e.density.padEnd(8)} conf=${e.confidence.toFixed(2)} sources=${e.sources.total - (e.sources.failed?.length || 0)}/${e.sources.total}`);
  }

  const graph = buildGraphFromEnvelopes(valid);
  const claims = arbitrate(graph);
  claims.sort((a, b) => b.confidence - a.confidence);

  console.log(`\n=== ${claims.length} claims sorted by confidence ===`);
  for (const c of claims) {
    console.log(`  conf=${c.confidence.toFixed(3)}  ${c.claim}`);
  }

  console.log(`\nPASS: ${claims.length} sectors flowing through graph`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
