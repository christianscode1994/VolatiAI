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
export function buildClaimGraph(snapshot) {
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

    for (let i = 0; i < sorted.length - 1; i++) {
      const prior = sorted[i];
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
