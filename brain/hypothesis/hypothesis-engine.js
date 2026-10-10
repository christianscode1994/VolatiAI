export function generateHypotheses(graph) {

  const hypotheses = [];

  const nodes = graph.nodes || [];

  const labels = nodes.map(
    n => (n.label || "").toLowerCase()
  );

  const copper =
    labels.some(x => x.includes("copper"));

  const demand =
    labels.some(x => x.includes("demand"));

  const mining =
    labels.some(x => x.includes("mine"));

  if (copper && demand && mining) {

    hypotheses.push({
      hypothesis:
        "Future copper shortage possible",
      confidence: 0.74
    });

  }

  return hypotheses;
}
