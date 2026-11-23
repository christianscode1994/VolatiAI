import { sign as relationSign } from "./relations.js";
import { loadGraph } from "./graph_store.js";

export async function signalsBeliefPropagate(args = {}) {
  const signal = args.signal;
  const maxIter = args.max_iterations || 30;
  const epsilon = args.epsilon || 0.001;
  if (!signal) return { error: "Missing signal" };

  const g = loadGraph();
  if (!g.nodes || !g.nodes[signal]) return { error: `Unknown node: ${signal}` };

  const nodes = Object.keys(g.nodes);
  const nodeSet = new Set(nodes);

  const cleanEdges = [];
  let dropped = 0;
  for (const e of g.edges) {
    if (!nodeSet.has(e.source) || !nodeSet.has(e.target)) { dropped++; continue; }
    if (typeof e.weight !== "number" || !isFinite(e.weight)) { dropped++; continue; }
    cleanEdges.push(e);
  }

  const beliefs = {};
  for (const n of nodes) beliefs[n] = 0.5;

  const incoming = {};
  for (const n of nodes) incoming[n] = [];
  for (const e of cleanEdges) {
    incoming[e.target].push({
      source: e.source,
      weight: e.weight,
      sign: relationSign(e.relation) || 1,  // neutral treated as positive for legacy compat
    });
  }

  let iterations = 0;
  let delta = Infinity;
  while (iterations < maxIter && delta > epsilon) {
    const next = {};
    for (const n of nodes) {
      const edges = incoming[n] || [];
      if (edges.length === 0) { next[n] = beliefs[n]; continue; }
      let posSum = 0, negSum = 0;
      for (const e of edges) {
        const contribution = e.weight * beliefs[e.source];
        if (e.sign > 0) posSum += contribution;
        else negSum += contribution;
      }
      const total = posSum + negSum;
      const raw = total > 0 ? posSum / total : 0.5;
      next[n] = Math.max(0, Math.min(1, raw));
    }
    delta = 0;
    for (const n of nodes) {
      const d = Math.abs(next[n] - beliefs[n]);
      if (d > delta) delta = d;
    }
    for (const n of nodes) beliefs[n] = next[n];
    iterations++;
  }

  const value = beliefs[signal];
  const finalBelief = typeof value === "number" && isFinite(value)
    ? Number(value.toFixed(4))
    : null;

  return {
    signal,
    belief: finalBelief,
    iterations,
    converged: delta <= epsilon && isFinite(delta),
    final_delta: Number((isFinite(delta) ? delta : 0).toFixed(6)),
    dropped_edges: dropped,
    method: "belief_propagation_v1",
    note: "belief = posSum / (posSum + negSum), where each is weighted by the source's belief. Contradicting edges subtract. Converges when max node delta < epsilon."
  };
}
