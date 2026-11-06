export function summarizeNarrative(state: any, risk: any, opportunities: any[]) {
  return {
    headline: "VolatiAI daily snapshot",
    risk_level: risk.globalRisk,
    opportunity_count: opportunities.length,
  };
}
