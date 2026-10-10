export function buildWorldModel(graph) {
  const world = {
    economy: {},
    companies: {},
    politics: {},
    technology: {}
  };

  for (const node of graph.nodes || []) {

    const category = node.category;

    if (!world[category]) {
      world[category] = {};
    }

    world[category][node.id] = {
      confidence: node.confidence || 0.5,
      value: node.value || null
    };
  }

  return world;
}
