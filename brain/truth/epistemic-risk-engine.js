export function epistemicRisk({
  confidence = 0.5,
  reputation = 0.5,
  independence = 0.5,
  contradictions = 0
}) {

  const risk =
    ((1 - confidence) * 0.35) +
    ((1 - reputation) * 0.25) +
    ((1 - independence) * 0.25) +
    (contradictions * 0.15);

  return Math.max(
    0,
    Math.min(1, risk)
  );
}
