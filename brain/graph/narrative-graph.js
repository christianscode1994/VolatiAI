export function narrativeGraph(
  packet
) {

  const narratives = {};

  for (
    const claim of packet.claims
  ) {

    const domain =
      claim.domain ??
      "unknown";

    narratives[domain] ??= [];

    narratives[
      domain
    ].push(claim);
  }

  return narratives;
}
