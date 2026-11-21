import { loadGraph } from "./graph_store.js";

export async function signalsSimulate(args = {}) {
  const { source, shock, max_depth = 5 } = args;
  if (!source) return { error: "Missing source" };
  if (typeof shock !== "number" || !isFinite(shock)) return { error: "Missing or non-numeric shock" };
  if (shock < -1 || shock > 1) return { error: "shock must be in [-1, 1]" };

  const g = loadGraph();
  if (!g.nodes[source]) return { error: `Unknown node: ${source}` };

  const adj = {};
  for (const e of g.edges) {
    if (e.relation !== "supports") continue;
    if (!adj[e.source]) adj[e.source] = [];
    adj[e.source].push({ target: e.target, weight: e.weight || 0 });
  }

  const impacts = new Map();
  const queue = [{ node: source, impact: shock, path: [source], depth: 0 }];

  while (queue.length > 0) {
    const { node, impact, path, depth } = queue.shift();
    if (depth >= max_depth) continue;

    if (node !== source) {
      const existing = impacts.get(node);
      if (!existing || Math.abs(impact) > Math.abs(existing.impact)) {
        impacts.set(node, { node, impact: Number(impact.toFixed(4)), path });
      }
    }

    for (const edge of (adj[node] || [])) {
      if (path.includes(edge.target)) continue;
      const newImpact = impact * edge.weight;
      if (Math.abs(newImpact) < 0.001) continue;
      queue.push({
        node: edge.target,
        impact: newImpact,
        path: [...path, edge.target],
        depth: depth + 1,
      });
    }
  }

  const results = [...impacts.values()].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  return {
    source,
    shock,
    method: "deterministic_propagation_v1",
    note: "Impacts are multiplicative along paths (compound decay). Contradicting edges are not traversed.",
    impacted_count: results.length,
    impacts: results,
  };
}
