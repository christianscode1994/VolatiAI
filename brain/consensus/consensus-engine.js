/**
 * Detect agreement among graph packets
 */

export function consensus(claims = []) {
  if (!Array.isArray(claims) || claims.length === 0) {
    return {
      consensusExists: false,
      strength: 0,
      supporters: 0,
      dissenters: 0
    };
  }

  const groups = {};

  for (const claim of claims) {
    const key = claim.narrative || claim.claim || "unknown";
    groups[key] = (groups[key] || 0) + 1;
  }

  const ranked = Object.entries(groups)
    .sort((a, b) => b[1] - a[1]);

  const [winner, count] = ranked[0];

  return {
    consensusExists: count > 1,
    narrative: winner,
    strength: Number((count / claims.length).toFixed(3)),
    supporters: count,
    dissenters: claims.length - count
  };
}

export default consensus;
