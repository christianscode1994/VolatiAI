export function createGraph() {
  return {
    nodes: [],
    edges: [],
    metadata: {}
  };
}

export function addNode(graph, node) {
  return {
    ...graph,
    nodes: [...graph.nodes, node]
  };
}

export function addEdge(graph, edge) {
  return {
    ...graph,
    edges: [...graph.edges, edge]
  };
}

export function createNode(
  id,
  type,
  properties = {}
) {
  return {
    id,
    type,
    properties
  };
}

export function createEdge(
  from,
  to,
  relation,
  weight = 1
) {
  return {
    from,
    to,
    relation,
    weight
  };
}
