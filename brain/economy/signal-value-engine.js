export function signalValue({
  confidence,
  sourceCount,
  reuseCount
}) {

  return (
    confidence *
    sourceCount *
    (1 + reuseCount)
  );
}
``
