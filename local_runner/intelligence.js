// intelligence.js — VolatiAI Intelligence Layer

function score(stats) {
  const { mean, variance, max } = stats;
  const volBoost = Math.min(variance / (max || 1), 1);
  const raw = mean * (1 + 0.5 * volBoost);
  return Math.max(0, Math.min(raw, 1));
}

export function intelligenceModel(fused) {
  return {
    trend_acceleration: score(fused.trend_acceleration),
    narrative_velocity: score(fused.narrative_velocity),
    whale_pressure: score(fused.whale_pressure),
    spoofing_probability: score(fused.spoofing_probability),
    chain_truth: score(fused.chain_truth),
    sector_growth: score(fused.sector_growth),
    timestamp: Date.now()
  };
}
