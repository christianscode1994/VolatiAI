export function consensus(
  arbitrationResults
) {

  const average =

    arbitrationResults.reduce(
      (sum, item) =>
        sum +
        item.confidence,
      0
    ) /

    Math.max(
      arbitrationResults.length,
      1
    );

  return {
    consensus: average
  };
}
