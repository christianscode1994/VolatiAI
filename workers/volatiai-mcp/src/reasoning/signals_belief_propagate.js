import { loadGraph } from "./graph_store.js";

export async function signalsBeliefPropagate(args = {}) {
  const signal = args.signal;
  const maxIter = args.max_iterations || 30;
  const epsilon = args.epsilon || 0.001;
  if (!signal) return { error: "Missing signal" };

  const g = loadGraph();
  if (!g.nodes[signal]) return { error: `Unknown node: ${signal}` };

  const nodes = Object.keys(g.nodes);
  let beliefs = {};
  for (const n of nodes) beliefs[n] = 0.5;

  const incoming = {};
  for (const n of nodes) incoming[n] = [];
  for (const e of g.edges) {
    if (!incoming[e.target]) incoming[e.target] = [];
    incoming[e.target].push({ source: e.source, weight: e.weight || 0, relation: e.relation });
  }

  let iterations = 0;
  let delta = Infinity;
  while (iterations < maxIter && delta > epsilon) {
    const next = {};
    for (const n of nodes) {
      const edges = incoming[n] || [];
      if (edges.length === 0) { next[n] = beliefs[n]; continue; }
      let weightSum = 0;
      let weightedBelief = 0;
      for (const e of edges) {
        const sign = e.relation === "contradicts" ? -1 : 1;
        weightedBelief += sign * e.weight * beliefs[e.source];
        weightSum += e.weight;
      }
      next[n] = weightSum > 0
        ? Math.max(0, Math.min(1, (weightedBelief + weightSum) / (2 * weightSum)))
        : beliefs[n];
    }
    delta = 0;
    for (const n of nodes) {
      const d = Math.abs(next[n] - beliefs[n]);
      if (d > delta) delta = d;
    }
    beliefs = next;
    iterations++;
  }

  return {
    signal,
    belief: Number(beliefs[signal].toFixed(4)),
    iterations,
    converged: delta <= epsilon,
    final_delta: Number(delta.toFixed(6)),
    method: "belief_propagation_v1",
    note: "Iterative belief flow along all edges. Contradicting edges subtract weight. Converges when max node delta < epsilon."
  };
}
