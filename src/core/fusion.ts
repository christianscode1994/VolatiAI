// Cross-Signal Anomaly Engine (CSAE) for VolatiAI

type Signals = {
  volatility_score: number;
  sentiment_score: number;   // expected range [-1, 1]
  developer_score: number;
  depth_stress_score: number;
  rpc_truth_score: number;
};

type AnomalyLevel = 'normal' | 'ignition' | 'critical' | 'systemic';

function clip(x: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, x));
}

function normalizeSignals(s: Signals) {
  // Tune these to your actual score ranges
  const Vmax = 100;
  const Dmax = 100;
  const Smax = 100;
  const Tmax = 100;

  const s_vol   = clip(s.volatility_score / Vmax);
  const s_sent  = clip((s.sentiment_score + 1) / 2); // map [-1,1] -> [0,1]
  const s_dev   = clip(s.developer_score / Dmax);
  const s_depth = clip(s.depth_stress_score / Smax);
  const s_truth = 1 - clip(s.rpc_truth_score / Tmax); // higher = more anomaly

  return { s_vol, s_sent, s_dev, s_depth, s_truth };
}

function computeAnomalyScore(signals: Signals): number {
  const { s_vol, s_sent, s_dev, s_depth, s_truth } = normalizeSignals(signals);

  const arr = [s_vol, s_sent, s_dev, s_depth, s_truth];
  const weights = [0.25, 0.2, 0.2, 0.2, 0.15]; // adjust if needed

  // Weighted sum (primary anomaly component)
  const A = arr.reduce((acc, v, i) => acc + v * weights[i], 0);

  // Cross-signal interaction (boost when multiple signals are high together)
  let C = 0;
  const N = arr.length;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      C += arr[i] * arr[j];
    }
  }
  C /= (N * (N - 1) / 2); // average pairwise product

  const alpha = 0.7;
  const beta  = 0.3;

  return clip(alpha * A + beta * C);
}

function computeAnomalyLevel(score: number): AnomalyLevel {
  if (score >= 0.9) return 'systemic';
  if (score >= 0.8) return 'critical';
  if (score >= 0.65) return 'ignition';
  return 'normal';
}
