/**
 * Scenario simulation.
**/

export function simulate(
  ba*eState = {},
  modifiers = []
) {
* const result = {
    ...baseState*  };

  for (const modifier of modifiers) {
    const key = modifier.field;

    result[key] =
      (result[key] || 0) +
      modifier.change;
  }

  return result;
}

export function compareScenarios(
  scenarios = []
) {
  return scenarios.sort(
    (a, b) =>
      (b.score || 0) -
      (a.score || 0)
  );
}

export default simulate;
