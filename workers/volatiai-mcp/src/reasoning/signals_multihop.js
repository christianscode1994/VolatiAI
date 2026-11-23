import { isTraversable } from "./relations.js";
import { loadGraph } from "./graph_store.js";

export async function signalsMultihop(args = {}) {
  const { from, to, max_depth = 5, limit = 20 } = args;
  if (!from || !to) return { error: "Missing from or to" };
  const g = loadGraph();
  const adj = {};
  for (const e of g.edges) {
    if (!isTraversable(e.relation)) continue;
    if (!adj[e.source]) adj[e.source] = [];
    adj[e.source].push({ target: e.target, weight: e.weight || 0 });
  }
  const paths = [];
  function dfs(node, path, cumWeight) {
    if (path.length > max_depth + 1) return;
    if (node === to) {
      paths.push({ nodes: [...path], weight: Number(cumWeight.toFixed(4)) });
      return;
    }
    for (const next of (adj[node] || [])) {
      if (path.includes(next.target)) continue;
      path.push(next.target);
      dfs(next.target, path, cumWeight + next.weight);
      path.pop();
    }
  }
  dfs(from, [from], 0);
  return {
    from,
    to,
    max_depth,
    path_count: paths.length,
    returned: Math.min(paths.length, limit),
    truncated: paths.length > limit,
    paths: paths.sort((a, b) => b.weight - a.weight).slice(0, limit),
  };
}
