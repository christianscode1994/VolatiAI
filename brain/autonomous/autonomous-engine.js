export function nextMission(
  hypotheses,
  contradictions
) {
  return {
    objective:
      contradictions[0]?.claim ||
      hypotheses[0]?.claim
  };
}
