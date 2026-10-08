export function evaluateBids(
  mission,
  bids
) {

  return bids

    .filter(
      bid =>
        bid.capability ===
        mission.capability
    )

    .sort(
      (a, b) =>

        (
          b.reputation *
          b.confidence
        )

        -

        (
          a.reputation *
          a.confidence
        )
    );
}
