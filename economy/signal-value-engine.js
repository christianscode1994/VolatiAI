export function signalValue({
  confidence,
  sourceCount,
  reuseCount,
  reputation
}) {

  return (
    confidence *
    (sourceCount + 1) *
    (reuseCount + 1) *
    (reputation + 1)
  );
}
