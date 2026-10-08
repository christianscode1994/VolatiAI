export function contradict(
  graph,
  claimA,
  claimB,
  weight = 1
) {

  graph.edges.push({
    from: claimA,
    to: claimB,
    relation: "contradicts",
    weight
  });

  return graph;
}
