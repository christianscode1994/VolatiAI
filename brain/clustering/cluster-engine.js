export function clusterGraph(graph) {

  const visited = new Set();
  const clusters = [];

  for (const node of graph.nodes) {

    if (visited.has(node.id)) continue;

    const cluster = [];
    const queue = [node.id];

    while (queue.length) {

      const current = queue.shift();

      if (visited.has(current)) continue;

      visited.add(current);
      cluster.push(current);

      const neighbors = graph.edges
        .filter(
          e => e.from === current ||
               e.to === current
        )
        .flatMap(e => [e.from, e.to]);

      queue.push(...neighbors);
    }

    clusters.push(cluster);
  }

  return clusters;
}
