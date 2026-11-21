import { loadGraph } from "./graph_store.js";

export async function signalsBelief(args = {}) {
  const signal = args.signal;
  if (!signal) return { error: "Missing signal" };
  const g = loadGraph();
  const supports = g.edges.filter(e => e.target === signal && e.relation === "supports");
  const contradicts = g.edges.filter(e => e.target === signal && e.relation === "contradicts");
  const sWeight = supports.reduce((a, e) => a + (e.weight || 0), 0);
  const cWeight = contradicts.reduce((a, e) => a + (e.weight || 0), 0);
  const total = sWeight + cWeight;
  return {
    signal,
    support_count: supports.length,
    contradiction_count: contradicts.length,
    support_weight: Number(sWeight.toFixed(4)),
    contradiction_weight: Number(cWeight.toFixed(4)),
    confidence: total > 0 ? Number((sWeight / total).toFixed(4)) : 0,
    method: "weighted_ratio_v1",
  };
}
