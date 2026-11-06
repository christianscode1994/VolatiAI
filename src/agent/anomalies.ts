export function detectAnomalies({ latest, flows, reliability }: any) {
  const anomalies: any[] = [];

  if (latest.volatility.value > 0.8) {
    anomalies.push({ type: "high_volatility", value: latest.volatility.value });
  }

  for (const sector of flows.sectors) {
    if (sector.inflow - sector.outflow > 0.5) {
      anomalies.push({ type: "strong_inflow", sector: sector.id });
    }
  }

  if (reliability.global_score < 0.6) {
    anomalies.push({ type: "low_reliability", value: reliability.global_score });
  }

  return anomalies;
}
