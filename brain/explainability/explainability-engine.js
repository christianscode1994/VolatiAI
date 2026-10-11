export function explain(result, graph) {
  return {
    conclusion: result.claim,
    confidence: result.confidence,
    evidence: result.evidence,
    path: graph.path || []
  };
}
