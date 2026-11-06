// fusion.js — VolatiAI Fusion Layer

export function fuseSignals(sectors) {
  const numericKeys = [
    "trend_acceleration",
    "narrative_velocity",
    "whale_pressure",
    "spoofing_probability",
    "chain_truth",
    "sector_growth"
  ];

  const agg = {};

  for (const key of numericKeys) {
    const values = sectors
      .map(s => s.data?.[key])
      .filter(v => typeof v === "number");

    if (!values.length) {
      agg[key] = { mean: 0, max: 0, min: 0, variance: 0 };
      continue;
    }

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);
    const variance =
      values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;

    agg[key] = { mean, max, min, variance };
  }

  return agg;
}
