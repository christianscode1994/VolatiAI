export function detectConvergences(graph) {

  return graph
    .filter(edge => edge.weight >= 1)
    .slice(0, 100);

}
