import graph from "../evidence_graph.json" with { type: "json" };
import { isTraversable } from "./relations.js";

export async function signalsCommunities() {
  const nodes = Object.keys(graph.nodes);

  // Build undirected adjacency
  const adj = {};
  for (const n of nodes) adj[n] = [];
  for (const e of graph.edges) {
    if (!isTraversable(e.relation)) continue;
    if (!adj[e.source] || !adj[e.target]) continue;
    adj[e.source].push({ n: e.target, w: e.weight || 0 });
    adj[e.target].push({ n: e.source, w: e.weight || 0 });
  }

  // Label propagation: deterministic — iterate nodes in sorted order,
  // assign each node the weighted-majority label of its neighbors.
  // Ties broken by lowest label string (deterministic).
  const sorted = [...nodes].sort();
  const label = {};
  for (const n of sorted) label[n] = n;  // each node starts with its own label

  const MAX_ITER = 30;
  let iterations = 0;
  let changed = true;

  while (changed && iterations < MAX_ITER) {
    changed = false;
    iterations++;
    for (const n of sorted) {
      const weights = {};
      for (const edge of adj[n]) {
        const l = label[edge.n];
        weights[l] = (weights[l] || 0) + edge.w;
      }
      if (Object.keys(weights).length === 0) continue;
      let best = null, bestWeight = -Infinity;
      for (const [l, w] of Object.entries(weights)) {
        if (w > bestWeight || (w === bestWeight && l < best)) {
          best = l;
          bestWeight = w;
        }
      }
      if (best !== label[n]) {
        label[n] = best;
        changed = true;
      }
    }
  }

  // Group by label
  const groups = {};
  for (const n of sorted) {
    const l = label[n];
    if (!groups[l]) groups[l] = [];
    groups[l].push(n);
  }

  // Sort communities by size desc
  return Object.entries(groups)
    .map(([label, members]) => ({
      community_label: label,
      size: members.length,
      nodes: members.sort(),
    }))
    .sort((a, b) => b.size - a.size)
    .map((c, i) => ({ community: i + 1, ...c }));
}
