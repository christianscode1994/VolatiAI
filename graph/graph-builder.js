export function buildGraph(entities) {

  const graph = [];

  for (let i = 0; i < entities.length; i++) {

    for (let j = i + 1; j < entities.length; j++) {

      graph.push({
        source: entities[i].value,
        target: entities[j].value,
        weight: 1
      });

    }

  }

  return graph;
}
