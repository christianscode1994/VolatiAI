export function resolveClaims(
  packet
) {

  const clusters =
    new Map();

  for (
    const claim of packet.claims
  ) {

    const key =
      claim.assertion
        .toLowerCase()
        .trim();

    if (
      !clusters.has(key)
    ) {

      clusters.set(
        key,
        []
      );
    }

    clusters
      .get(key)
      .push(claim);
  }

  return [...clusters.values()];
}
``
