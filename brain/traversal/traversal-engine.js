export function traverseGraph(startId, graph, maxDepth = 4) {
  const paths = [];

  function dfs(nodeId, path, depth) {
    if (depth > maxDepth) return;

    path.push(nodeId);

    const neighbors = graph.edges
      .filter(e => e.from === nodeId)
      .map(e => e.to);

    if (neighbors.length === 0) {
      paths.push([...path]);
    }

    for (const neighbor of neighbors) {
      dfs(neighbor, path, depth + 1);
    }

    path.pop();
  }

  dfs(startId, [], 0);

  return paths;
}
