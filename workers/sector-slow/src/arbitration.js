// arbitration.js — epistemic coherence + claim graph construction
//
// Two purposes:
// 1. coherenceScore(values, current) → 0-1, how consistent is current
//    with its own history? Buildable tonight from /_graph_snapshot data.
//
// 2. buildClaimGraph(snapshot) → nodes+edges for the arbitration engine.
//    Each prior observation supports or disputes the current claim based
//    on how close it is. Cross-source claims are not yet available; when
//    they arrive, this graph builder extends naturally.

// Confidence in the CURRENT claim, given its OWN history.
// Returns 0.0-1.0. Null if fewer than 2 observations.
export function coherenceScore(values, current) {
  if (!Array.isArray(values) || values.length < 2) return null;
  if (typeof current !== "number") return null;

  const nums = values.map(v => v.v).filter(v => Number.isFinite(v));
  if (nums.length < 2) return null;

  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
  const std = Math.sqrt(variance);

  if (std === 0) return 1.0;           // all identical, current is consistent
  const z = Math.abs(current - mean) / std;
  return Math.max(0, Math.min(1, 1 / (1 + z / 2)));
}

// Build a claim graph:
//   - One "claim" node per sector (the current value)
//   - One "prior_observation" node per historical point
//   - One edge per prior observation classifying as supports/contradicts
//
// Edge relation:
//   |delta| < 1%  → supports (weight 1.0)
//   |delta| < 5%  → supports (weight 0.5)
//   |delta| >= 5% → contradicts (weight 0.3)
//
// When multi-source data arrives, add "cross_source_claim" nodes and
// edges between them; the arbitration formula does not need to change.
export function buildClaimGraph(snapshot, thresholds = {}, windows = {}) {
  const nodes = [];
  const edges = [];

  if (!snapshot || !snapshot.sectors) return { nodes, edges };

  for (const [sector, data] of Object.entries(snapshot.sectors)) {
    if (!data.values || data.values.length < 2) continue;

    const sorted = [...data.values].sort((a, b) => a.t - b.t);
    const current = sorted[sorted.length - 1];
    const claimId = `${sector}::current`;

    nodes.push({
      id: claimId,
      type: "claim",
      sector,
      metric: data.metric,
      value: current.v,
      timestamp: current.t,
    });

    // Use sector window_days (default 7) for edge classification.
    // Old observations from before the current trend are not evidence
    // about today's value — they're historical. Only recent observations
    // support or dispute today. This applies uniformly to oscillating,
    // trending, and cumulative series.
    const windowDays = (windows[sector] ?? 7);
    const cutoff = current.t - windowDays * 86400 * 1000;

    for (let i = 0; i < sorted.length - 1; i++) {
      const prior = sorted[i];
      if (prior.t < cutoff) continue;   // skip observations outside window

      const pctDelta = Math.abs(current.v - prior.v) / Math.max(Math.abs(prior.v), 1);

      let relation, weight;
      if (pctDelta < 0.01)      { relation = "supports";    weight = 1.0; }
      else if (pctDelta < 0.05) { relation = "supports";    weight = 0.5; }
      else                      { relation = "contradicts"; weight = 0.3; }

      const priorId = `${sector}::prior::${prior.t}`;
      nodes.push({
        id: priorId,
        type: "prior_observation",
        sector,
        value: prior.v,
        timestamp: prior.t,
      });
      edges.push({ from: priorId, to: claimId, relation, weight });
    }
  }

  return { nodes, edges };
}

// Arbitration over a claim graph. Provenance-weighted: each edge
// contributes its `weight` (default 1.0) to support or dispute totals.
export function arbitrate(graph) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    return [];
  }

  const claims = graph.nodes.filter(n => n.type === "claim");

  return claims.map(claim => {
    const supporting = graph.edges.filter(
      e => e.to === claim.id && e.relation === "supports"
    );
    const disputing = graph.edges.filter(
      e => e.to === claim.id && e.relation === "contradicts"
    );

    const wSupport = supporting.reduce((s, e) => s + (e.weight ?? 1.0), 0);
    const wDispute = disputing.reduce((s, e) => s + (e.weight ?? 1.0), 0);
    const confidence = wSupport / Math.max(wSupport + wDispute, 1);

    let verdict;
    if (wSupport === 0 && wDispute === 0) verdict = "no_evidence";
    else if (confidence >= 0.85) verdict = "confirmed";
    else if (confidence >= 0.5)  verdict = "likely";
    else                         verdict = "disputed";

    return {
      claim: claim.id,
      sector: claim.sector,
      value: claim.value,
      confidence: Math.round(confidence * 1000) / 1000,
      support_count: supporting.length,
      dispute_count: disputing.length,
      verdict,
    };
  });
}


// ---- Detrended coherence ----
// Fits y = a + b*t on the time series, computes residuals, z-scores today's
// residual against the residual distribution.
// Handles: trending series (CO2, crossref), cumulative counters (USGS, doaj),
// oscillating series (treasuries). For oscillating, slope ~0 and result
// matches raw coherence. For monotonic, this correctly measures "is today
// unusually far from the trend?" rather than "is today far from the mean?"
export function detrendedCoherence(values, current) {
  if (!Array.isArray(values) || values.length < 3) return null;
  if (typeof current !== "number") return null;

  const pts = values.filter(v => Number.isFinite(v.t) && Number.isFinite(v.v));
  const n = pts.length;
  if (n < 3) return null;

  // Normalize t to days-since-first to keep the regression numerically stable
  const t0 = pts[0].t;
  const ts = pts.map(p => (p.t - t0) / 86400000);
  const vs = pts.map(p => p.v);

  const sumT  = ts.reduce((a, b) => a + b, 0);
  const sumV  = vs.reduce((a, b) => a + b, 0);
  const sumTV = ts.reduce((a, b, i) => a + b * vs[i], 0);
  const sumT2 = ts.reduce((a, b) => a + b * b, 0);

  const denom = n * sumT2 - sumT * sumT;
  if (denom === 0) return null;

  const slope = (n * sumTV - sumT * sumV) / denom;
  const intercept = (sumV - slope * sumT) / n;

  const residuals = ts.map((t, i) => vs[i] - (intercept + slope * t));
  const meanR = residuals.reduce((a, b) => a + b, 0) / n;
  const varR = residuals.reduce((a, b) => a + (b - meanR) ** 2, 0) / n;
  const stdR = Math.sqrt(varR);

  if (stdR === 0) return 1.0;

  const todayT = ts[n - 1];
  const todayResidual = current - (intercept + slope * todayT);
  const z = Math.abs(todayResidual - meanR) / stdR;

  return Math.max(0, Math.min(1, 1 / (1 + z / 2)));
}

// ---- Detrended residual series ----
// Returns the residuals array (per point) used by correlation.
export function detrendedResiduals(values) {
  if (!Array.isArray(values) || values.length < 3) return null;

  const pts = values.filter(v => Number.isFinite(v.t) && Number.isFinite(v.v));
  const n = pts.length;
  if (n < 3) return null;

  const t0 = pts[0].t;
  const ts = pts.map(p => (p.t - t0) / 86400000);
  const vs = pts.map(p => p.v);

  const sumT  = ts.reduce((a, b) => a + b, 0);
  const sumV  = vs.reduce((a, b) => a + b, 0);
  const sumTV = ts.reduce((a, b, i) => a + b * vs[i], 0);
  const sumT2 = ts.reduce((a, b) => a + b * b, 0);

  const denom = n * sumT2 - sumT * sumT;
  if (denom === 0) return null;

  const slope = (n * sumTV - sumT * sumV) / denom;
  const intercept = (sumV - slope * sumT) / n;

  return {
    ts,
    residuals: ts.map((t, i) => vs[i] - (intercept + slope * t)),
  };
}

// ---- Pearson correlation ----
export function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  if (denom === 0) return null;
  return num / denom;
}


// Two-tailed p-value from Pearson r using the t-distribution approximation.
// t = r * sqrt((n-2)/(1-r^2)), df = n-2. Approximated with the
// normal distribution for n > 30 (which is our case). For smaller n
// this overstates significance.
export function correlationPValue(r, n) {
  if (!Number.isFinite(r) || !Number.isFinite(n) || n < 3) return null;
  const absR = Math.min(Math.abs(r), 0.999999);
  const t = absR * Math.sqrt((n - 2) / (1 - absR * absR));
  // Normal approximation to two-tailed p
  const p = 2 * (1 - normalCDF(t));
  return Math.max(0, Math.min(1, p));
}

function normalCDF(x) {
  // Abramowitz & Stegun 7.1.26
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x >= 0 ? 1 - prob : prob;
}

// Flag mechanism plausibility heuristically. Two sectors from completely
// different domains (physical + scholarly, economic + scholarly) with
// strong |r| are almost certainly artifacts of unmodeled periodic structure
// (weekday effects, aftershock clusters, seasonal patterns) that linear
// detrend does not remove.
const SECTOR_DOMAIN = {
  "treasuries":         "economic",
  "environment":        "atmospheric",
  "usgs-earthquakes":   "geological",
  "crossref-works":     "scholarly",
  "datacite-dois":      "scholarly",
  "doaj-articles":      "scholarly",
  "openfda-drug-recalls": "regulatory",
};

export function correlationWarning(a, b, absR, pValue) {
  if (pValue === null || absR < 0.5) return null;
  const da = SECTOR_DOMAIN[a] ?? "unknown";
  const db = SECTOR_DOMAIN[b] ?? "unknown";
  if (da === db) return null;
  return `strong |r| across different domains (${da} vs ${db}). ` +
         `Likely artifact of unmodeled periodic structure (weekday effects, ` +
         `aftershock clusters, seasonal patterns). Statistical significance ` +
         `does not imply mechanism.`;
}
