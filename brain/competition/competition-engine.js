export function compete(
  outputs
) {
  return outputs.sort(
    (a, b) => b.confidence - a.confidence
  );
}
