// graph/graph-builder.js
// Converts SignalEnvelope[] into a { nodes, edges } graph
// that truth/arbitration-engine.js can consume.

export function buildGraphFromEnvelopes(envelopes) {
  const nodes = [];
  const edges = [];
  const now = new Date().toISOString();

  for (const env of envelopes) {
    if (!env || !env.sector) continue;

    const claimId = `claim:${env.sector}:${env.timestamp || now}`;

    nodes.push({
      id: claimId,
      type: "claim",
      sector: env.sector,
      content: env.summary || "",
      density: env.density || "dense",
      severity: env.severity || "info",
      has_signal: !!env.has_signal,
      timestamp: env.timestamp || now,
      original_confidence: typeof env.confidence === "number" ? env.confidence : 0,
    });

    const failed = Array.isArray(env.sources?.failed) ? env.sources.failed : [];
    const total = Number(env.sources?.total || 0);
    const healthyCount = Math.max(total - failed.length, 0);

    // Healthy sources -> supports, weight 1.0
    for (let i = 0; i < healthyCount; i++) {
      const sourceId = `source:${env.sector}:healthy:${i}`;
      nodes.push({
        id: sourceId,
        type: "source",
        sector: env.sector,
        healthy: true,
      });
      edges.push({
        from: sourceId,
        to: claimId,
        relation: "supports",
        weight: 1.0,
      });
    }

    // Failed sources -> contradicts, weight 0.5
    for (const name of failed) {
      const sourceId = `source:${env.sector}:failed:${name}`;
      nodes.push({
        id: sourceId,
        type: "source",
        sector: env.sector,
        healthy: false,
      });
      edges.push({
        from: sourceId,
        to: claimId,
        relation: "contradicts",
        weight: 0.5,
      });
    }
  }

  return {
    nodes,
    edges,
    built_at: now,
    claim_count: nodes.filter(n => n.type === "claim").length,
    source_count: nodes.filter(n => n.type === "source").length,
  };
}
