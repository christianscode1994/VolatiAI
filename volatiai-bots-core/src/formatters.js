export function formatRiskMessage(risk) {
  const global = risk.global.toFixed(2);
  const systemic = risk.systemic.toFixed(2);
  const sectors = risk.top_sectors
    .map(s => `${s.sector} (${s.score.toFixed(2)})`)
    .join(", ");

  return [
    `🌋 VolatiAI Risk`,
    `Global: ${global}`,
    `Systemic: ${systemic}`,
    `Top sectors: ${sectors}`,
    risk.latest_signal
      ? `Signal: ${risk.latest_signal.type} @ ${risk.latest_signal.value.toFixed(2)}`
      : `Signal: none active`
  ].join("\n");
}
