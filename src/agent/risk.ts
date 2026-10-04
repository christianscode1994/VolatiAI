import { SectorGraph } from "../graph/model";
import { degreeCentrality } from "../graph/metrics";

export function evaluateRisk(
  state: any,
  graph: SectorGraph,
  anomalies: any[]
) {
  const centrality = degreeCentrality(graph);
  const sectorRisk: any[] = [];

  for (const sector of state.flows.sectors) {
    const vol = state.latest.volatility.value;
    const rel = state.reliability.global_score;
    const cent = centrality[sector.id] ?? 0;

    const riskScore =
      0.4 * vol +
      0.3 * (1 - rel) +
      0.3 * cent;

    sectorRisk.push({
      sector: sector.id,
      score: Number(riskScore.toFixed(2)),
    });
  }

  const globalRisk = Number(
    (sectorRisk.reduce((s, x) => s + x.score, 0) / sectorRisk.length || 0).toFixed(2)
  );

  return { globalRisk, sectorRisk, anomalies };
}
