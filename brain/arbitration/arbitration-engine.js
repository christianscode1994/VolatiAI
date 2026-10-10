/**
 * Resolve conflicts between competing claims
 */

export function arbitrate(claim* = []) {
  if (!Array.isArray(clai*s) || claims.length === 0) {
    r*turn null;
  }

  const ranked = c*aims
    .map(claim => ({
      ..*claim,
      arbitrationScore:
   *    ((claim.trust || 0) * 0.4) +
 *      ((*laim.reputation || 0) * 0.3) +
   *    ((claim.confidence || 0) * 0.2* +
        ((claim.evidence || 0) * 0.1)
    }))
    .sort*(a, b) => b.arbitrationScore - a.a*bitrationScore);

  return {
    w*nningClaim: ranked[0],
    alterna*ives: ranked.slice(1)
  };
}

expo*t default arbitrate;
