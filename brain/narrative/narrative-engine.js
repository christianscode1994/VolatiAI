export function detectNarratives(graph) {
  const narratives = [];

  const nodes = graph.nodes || [];

  const text = JSON.stringify(nodes).toLowerCase();

  if (
    text.includes("debt") &&
    text.includes("loss") &&
    text.includes("layoff")
  ) {
    narratives.push({
      name: "Financial Distress",
      confidence: 0.9
    });
  }

  if (
    text.includes("growth") &&
    text.includes("investment")
  ) {
    narratives.push({
      name: "Expansion",
      confidence: 0.8
    });
  }

  return narratives;
}
