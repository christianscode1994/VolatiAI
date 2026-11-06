export function pageRank(
  graph,
  iterations = 20,
  damping = 0.85
) {

  const ranks = {};

  const nodeCount =
    graph.nodes.length || 1;

  graph.nodes.forEach(node => {
    ranks[node.id] = 1 / nodeCount;
  });

  for (
    let i = 0;
    i < iterations;
    i++
  ) {

    const next = {};

    graph.nodes.forEach(node => {
      next[node.id] =
        (1 - damping) /
        nodeCount;
    });

    graph.nodes.forEach(node => {

      const outgoing =
        graph.edges.filter(
          e => e.from === node.id
        );

      if (!outgoing.length) return;

      const share =
        ranks[node.id] /
        outgoing.length;

      outgoing.forEach(edge => {
        next[edge.to] +=
          damping * share;
      });

    });

    Object.assign(ranks, next);
  }

  return ranks;
}
