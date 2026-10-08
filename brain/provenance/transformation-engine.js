export function recordTransformation(
  graph,
  sourceId,
  targetId,
  transformation
) {

  graph.edges.push({

    from: sourceId,

    to: targetId,

    relation:
      "transformed_to",

    transformation,

    weight: 1
  });

  return graph;
}
