export function reviseBelief(
  current = 0.5,
  evidence = 0.5,
  weight = 0.5
) {

  const next =
    current +
    ((evidence - current) * weight);

  return Math.max(
    0,
    Math.min(1, next)
  );
}
