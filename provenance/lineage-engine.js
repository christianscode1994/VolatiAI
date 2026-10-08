export function lineage(
  graph,
  nodeId
) {

  const visited =
    new Set();

  const chain = [];

  function walk(id) {

    if (visited.has(id))
      return;

    visited.add(id);

    const parents =
      graph.edges.filter(
        e =>
          e.from === id &&
          e.relation === "derived_from"
      );

    for (const edge of parents) {

      chain.push(edge.to);

      walk(edge.to);
    }
  }

  walk(nodeId);

  return chain;
}
