export function verifyPrediction(
  prediction,
  actual
) {
  return {
    prediction,
    actual,
    correct:
      prediction.outcome === actual.outcome
  };
}
