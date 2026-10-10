export function scoreNarratives(narratives) {

  return narratives.map(n => {

    const score =
      n.evidenceCount * 0.4 +
      n.reliability * 0.3 +
      n.consensus * 0.3;

    return {
      ...n,
      score: Math.min(score, 1)
    };
  });

}
