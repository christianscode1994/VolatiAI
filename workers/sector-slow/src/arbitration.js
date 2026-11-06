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
  if (typeof current !== "number" || !Number.isFinite(current)) return null;

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

    // Per-sector volatility: median absolute pct_change across history.
    // Median rather than mean, because a single data glitch or one big
    // news day should not permanently inflate the band. Falls back to 2%
    // (typical slow-sector volatility) when history is too short.
    const sectorVol = (() => {
      const pcts = [];
      for (let k = 1; k < sorted.length; k++) {
        const p = sorted[k-1].v;
        const c = sorted[k].v;
        if (Number.isFinite(p) && Number.isFinite(c) && p !== 0) {
          pcts.push(Math.abs((c - p) / p));
        }
      }
      if (pcts.length < 3) return 0.02;
      pcts.sort((a, b) => a - b);
      const mid = Math.floor(pcts.length / 2);
      return pcts.length % 2 === 0
        ? (pcts[mid-1] + pcts[mid]) / 2
        : pcts[mid];
    })();
    const nearThresh = Math.max(sectorVol * 0.5, 0.002);
    const farThresh  = Math.max(sectorVol * 2.0, 0.01);

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

      // Per-sector bands. A 5% move in CO2 (extreme) is not the same event
      // as a 5% move in BTC (normal). Both were classified identically by
      // the old hardcoded bands. Using the sector's own historical volatility
      // makes the classification actually sector-aware.
      let relation, weight;
      if (pctDelta < nearThresh)      { relation = "supports";    weight = 1.0; }
      else if (pctDelta < farThresh)  { relation = "supports";    weight = 0.5; }
      else                            { relation = "contradicts"; weight = 0.3; }

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

  // Cross-source edges: same metric from different sectors get bidirectional
  // supports/contradicts edges based on |a.value - b.value| / max(|a|,|b|).
  const claimList = nodes.filter(n => n.type === "claim");
  for (let i = 0; i < claimList.length; i++) {
    for (let j = i + 1; j < claimList.length; j++) {
      const a = claimList[i], b = claimList[j];
      if (a.metric !== b.metric) continue;
      if (a.sector === b.sector) continue;
      if (typeof a.value !== "number" || typeof b.value !== "number") continue;
      const denom = Math.max(Math.abs(a.value), Math.abs(b.value), 1e-9);
      const pctDelta = Math.abs(a.value - b.value) / denom;

      let relation, weight;
      if (pctDelta < 0.005)     { relation = "supports";    weight = 1.0; }
      else if (pctDelta < 0.02) { relation = "supports";    weight = 0.5; }
      else                      { relation = "contradicts"; weight = 0.5; }

      edges.push({ from: b.id, to: a.id, relation, weight, cross_source: true });
      edges.push({ from: a.id, to: b.id, relation, weight, cross_source: true });
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
  if (typeof current !== "number" || !Number.isFinite(current)) return null;

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
// Two-tailed p-value using t-distribution with df = n - 2.
// Converges to normal for large n; correct for small n (Pearson r)
// this overstates significance.
export function correlationPValue(r, n) {
  if (!Number.isFinite(r) || !Number.isFinite(n) || n < 3) return null;
  const absR = Math.min(Math.abs(r), 0.999999);
  const t = absR * Math.sqrt((n - 2) / (1 - absR * absR));
  // Normal approximation to two-tailed p
  const p = tDistPValue(t, n - 2);
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
  "treasuries-gov":     "economic",
  "environment":        "atmospheric",
  "usgs-earthquakes":   "geological",
  "usgs-earthquakes-emsc": "geological",
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

// ─── t-distribution p-value ─────────────────────────────────────
// Two-tailed p-value for t-statistic with df degrees of freedom.
// Used by correlationPValue for correct small-sample significance.
//
// Method: regularized incomplete beta function I_x(a,b), computed via
// continued fraction (Lentz's algorithm), per Numerical Recipes §6.4.
//
// For two-tailed p: p = I_{df/(df+t²)}(df/2, 1/2)
//
// Verified against standard t-tables:
//   t=2.093, df=19, two-tailed p ≈ 0.05 (95% CI boundary)
//   t=2.861, df=19, two-tailed p ≈ 0.01
//   t=3.883, df=19, two-tailed p ≈ 0.001
//   t=5.38, df=19, two-tailed p ≈ 4e-5 (r=0.777, n=21 case)

function _betacf(a, b, x) {
  // Continued fraction for incomplete beta (Numerical Recipes §6.4)
  const MAXIT = 100;
  const EPS = 3e-7;
  const FPMIN = 1e-30;

  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;

    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function _gammaln(x) {
  // Stirling approximation for ln(Γ(x)) — sufficient for df up to ~1e4
  // Lanczos approximation, g=7, n=9
  const coef = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - _gammaln(1 - x);
  }
  x -= 1;
  let a = coef[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += coef[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function _betai(a, b, x) {
  // Regularized incomplete beta function I_x(a,b)
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    _gammaln(a + b) - _gammaln(a) - _gammaln(b) +
    a * Math.log(x) + b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) {
    return bt * _betacf(a, b, x) / a;
  } else {
    return 1 - bt * _betacf(b, a, 1 - x) / b;
  }
}

/**
 * Two-tailed p-value for t-statistic with df degrees of freedom.
 * Returns a number in [0, 1]. Uses the regularized incomplete beta
 * function, which is exact to ~1e-6 for df < 1000.
 *
 * @param {number} t - t-statistic (any sign; uses |t|)
 * @param {number} df - degrees of freedom (must be > 0)
 * @returns {number} two-tailed p-value
 */
export function tDistPValue(t, df) {
  if (!Number.isFinite(t) || !Number.isFinite(df) || df <= 0) return 1;
  const absT = Math.abs(t);
  if (absT === 0) return 1;
  const x = df / (df + absT * absT);
  return _betai(df / 2, 0.5, x);
}
