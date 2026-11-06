/**
 * What-if analysis.
 */

export function counterfactual({
  event,
  baseline = 0,
  impact = 0
}) {
  return {
    event,
    actual: baseline,
    withoutEvent: baseline - impact,
    delta: impact
  };
}

export function removeEvent(
  state = {},
  key
) {
  const copy = { ...state };

  delete copy[key];

  return copy;
}

export default counterfactual;
