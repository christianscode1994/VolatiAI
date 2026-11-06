export function propagateBelief(graph) {

  const beliefs = {};

  for (const node of graph.nodes) {
    beliefs[node.id] = node.belief || 0.5;
  }

  for (let iteration = 0; iteration < 5; iteration++) {

    const updates = {};

    for (const node of graph.nodes) {

      const incoming = graph.edges.filter(
        e => e.to === node.id
      );

      if (!incoming.length) {
        updates[node.id] = beliefs[node.id];
        continue;
      }

      let total = 0;

      for (const edge of incoming) {
        total += beliefs[edge.from] * edge.weight;
      }

      updates[node.id] = total / incoming.length;
    }

    Object.assign(beliefs, updates);
  }

  return beliefs;
}
