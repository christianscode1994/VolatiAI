export function findOpportunities(state: any, graphInfo: any) {
  const opportunities: any[] = [];

  for (const sector of state.flows.sectors) {
    const inflow = sector.inflow;
    const rel = state.reliability.global_score;
    const vol = state.latest.volatility.value;

    const score =
      0.5 * inflow +
      0.3 * rel -
      0.2 * vol;

    if (score > 0.3) {
      opportunities.push({
        sector: sector.id,
        score: Number(score.toFixed(2)),
        drivers: ["inflow", "reliability", "moderate volatility"],
      });
    }
  }

  return opportunities;
}
