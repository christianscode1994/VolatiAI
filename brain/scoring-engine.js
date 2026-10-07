export function scoreSignal(signal) {

  const impact =
    signal.impact ?? 50;

  const confidence =
    signal.confidence ?? 50;

  const novelty =
    signal.novelty ?? 50;

  const crossSector =
    signal.crossSector ?? 50;

  const score =
    Math.round(
      (
        impact +
        confidence +
        novelty +
        crossSector
      ) / 4
    );

  return {

    impact,
    confidence,
    novelty,
    crossSector,
    score

  };

}
