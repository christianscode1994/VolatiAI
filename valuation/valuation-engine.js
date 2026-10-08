export function valuate({
  confidence,
  provenanceDepth,
  influence
}) {

  return {
    value:
      confidence *
      Math.max(
        provenanceDepth,
        1
      ) *
      Math.max(
        influence,
        1
      )
  };
}
