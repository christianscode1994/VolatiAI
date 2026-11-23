import graph from "../evidence_graph.json" with { type: "json" };
import { isCausal } from "./relations.js";

export async function signalsNeighbors(args = {}) {
  const { node, hops = 2, direction = "out" } = args;
  if (!node) return { error: "Missing node" };

  const adj = {};
  for (const e of graph.edges) {
    if (!isCausal(e.relation)) continue;
    if (direction !== "in") {
      if (!adj[e.source]) adj[e.source] = [];
      adj[e.source].push({ target: e.target, weight: e.weight, relation: e.relation });
    }
    if (direction !== "out") {
      if (!adj[e.target]) adj[e.target] = [];
      adj[e.target].push({ target: e.source, weight: e.weight, relation: e.relation });
    }
  }

  const visited = new Map();  // node -> { distance, path, cumulative_weight }
  visited.set(node, { distance: 0, path: [node], cumulative_weight: 0 });
  const queue = [node];

  while (queue.length > 0) {
    const cur = queue.shift();
    const curInfo = visited.get(cur);
    if (curInfo.distance >= hops) continue;

    for (const edge of (adj[cur] || [])) {
      const nextInfo = visited.get(edge.target);
      const newDistance = curInfo.distance + 1;
      const newCw = curInfo.cumulative_weight + (edge.weight || 0);

      // Found a shorter path, or same distance with higher weight
      if (!nextInfo || newDistance < nextInfo.distance ||
          (newDistance === nextInfo.distance && newCw > nextInfo.cumulative_weight)) {
        visited.set(edge.target, {
          distance: newDistance,
          path: [...curInfo.path, edge.target],
          cumulative_weight: Number(newCw.toFixed(4)),
          via: edge.relation,
        });
        if (!queue.includes(edge.target)) queue.push(edge.target);
      }
    }
  }

  visited.delete(node);
  const results = [...visited.entries()]
    .map(([n, info]) => ({ node: n, ...info }))
    .sort((a, b) => a.distance - b.distance || b.cumulative_weight - a.cumulative_weight);

  return { root: node, hops, direction, neighbor_count: results.length, neighbors: results };
}
