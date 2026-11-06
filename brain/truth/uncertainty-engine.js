export function uncertainty(
  support,
  contradictions
) {

  const total =
    support +
    contradictions;

  if (!total) {
    return 1;
  }

  return (
    contradictions /
    total
  );
}
