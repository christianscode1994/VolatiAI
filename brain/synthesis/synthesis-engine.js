export function synthesizeKnowledge(
  cluster,
  graph
) {

  const names = cluster.map(id => {

    const node = graph.nodes.find(
      n => n.id === id
    );

    return node?.label || id;
  });

  return {
    theme: names[0],
    summary:
      `Knowledge cluster around ${names.join(", ")}`
  };
}
