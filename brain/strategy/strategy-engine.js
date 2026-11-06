/**
 * Prioritize investigation targets.
 */

export function prioritize(
  opportunities = []
) {
  return opportunities
    .sort(
      (a, b) =>
        (b.priority || 0) -
        (a.priority || 0)
    );
}

export function recommendNextAction(
  items = []
) {
  return prioritize(items)[0] || null;
}

export default prioritize;
