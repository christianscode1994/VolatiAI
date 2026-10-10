/**
 * Evaluate past decisions.
 */

export function reflect({
  prediction,
  outcome
}) {

  const success =
    prediction === outcome;

  return {
    prediction,
    outcome,
    success,
    accuracy: success ? 1 : 0
  };
}

export function summarizeReflections(
  reflections = []
) {
  const successes =
    reflections.filter(
      x => x.success
    ).length;

  return {
    total: reflections.length,
    accuracy:
      reflections.length === 0
        ? 0
        : Number(
            (
              successes /
              reflections.length
            ).toFixed(3)
          )
  };
}

export default reflect;
