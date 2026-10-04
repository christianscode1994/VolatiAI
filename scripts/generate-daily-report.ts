// scripts/generate-daily-report.ts
import fs from "fs/promises";
import { UIO } from "../src/uio/schema";

async function main() {
  const raw = await fs.readFile("./data/outputs/uio.json", "utf8");
  const uio: UIO = JSON.parse(raw);

  const lines: string[] = [];

  lines.push(`# VolatiAI Daily Intelligence Report — ${uio.timestamp}`);
  lines.push("");
  lines.push(`## Global Risk`);
  lines.push(`- Global: ${uio.risk.global.toFixed(2)} (systemic: ${uio.risk.systemic.toFixed(2)})`);
  lines.push("");

  lines.push(`## Top Sector Risks`);
  uio.risk.by_sector
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .forEach(r =>
      lines.push(`- ${r.sector}: ${r.score.toFixed(2)}`)
    );
  lines.push("");

  lines.push(`## Top Opportunities`);
  uio.opportunities
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .forEach(o =>
      lines.push(`- ${o.sector}: ${o.score.toFixed(2)} (${o.drivers.join(", ")})`)
    );
  lines.push("");

  lines.push(`## Narrative Arcs`);
  uio.narrative.arcs.slice(0, 5).forEach(a =>
    lines.push(
      `- ${a.topic}: ${a.direction} (strength ${a.strength.toFixed(2)}, velocity ${a.velocity.toFixed(2)})`
    )
  );
  lines.push("");

  lines.push(`## Notable Anomalies`);
  uio.anomalies.slice(0, 5).forEach(a =>
    lines.push(`- ${a.type ?? "unknown"}: ${JSON.stringify(a)}`)
  );
  lines.push("");

  lines.push(`## Graph Hotspots`);
  uio.graph.hotspots.forEach(h =>
    lines.push(`- ${h}`)
  );
  lines.push("");

  await fs.writeFile("./data/reports/daily.md", lines.join("\n"));
  console.log("Report written to data/reports/daily.md");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
