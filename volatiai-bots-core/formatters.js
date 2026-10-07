export function formatRiskMessage(risk) {
  const global = risk.global.toFixed(2);
  const systemic = risk.systemic.toFixed(2);
  const sectors = risk.top_sectors
    .map(s => `${s.sector} (${s.score.toFixed(2)})`)
    .join(", ");

  return [
    "🌋 VolatiAI Risk",
    `Global: ${global}`,
    `Systemic: ${systemic}`,
    `Top sectors: ${sectors}`,
    risk.latest_signal
      ? `Signal: ${risk.latest_signal.type} @ ${risk.latest_signal.value.toFixed(2)}`
      : "Signal: none active"
  ].join("\n");
}

export function formatOpportunityMessage(opp) {
  const top = opp.top_opportunities
    .map(o => `${o.sector} (${o.score.toFixed(2)})`)
    .join(", ");

  return [
    "🌱 VolatiAI Opportunities",
    `Top: ${top}`,
    opp.latest_signal
      ? `Signal: ${opp.latest_signal.type} in ${opp.latest_signal.sector}`
      : "Signal: none active"
  ].join("\n");
}

export function formatSignalsMessage(signals) {
  const active = Object.values(signals).filter(s => s && s.active !== false);
  if (!active.length) return "🔔 VolatiAI Signals: none active";

  return (
    "🔔 VolatiAI Signals:\n" +
    active.map(s => `- ${s.type} @ ${s.timestamp}`).join("\n")
  );
}
