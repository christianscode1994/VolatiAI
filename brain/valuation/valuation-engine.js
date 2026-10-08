export function valuate(
  confidence,
  provenance,
  impact
) {

  return (
    confidence *
    provenance *
    impact *
    100
  );
}
