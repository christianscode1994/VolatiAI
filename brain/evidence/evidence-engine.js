/**
 * E*idence scoring.
 */

export functi*n scoreEvidence(
  evidence = []
)*{
  if (!evidence.length) {
    re*urn {
      evidenceStrength: 0,
 *    evidenceCount: 0
    };
  }

 *const total = evidence.reduce(
   *(sum, item) => sum + (item.weight *| 1),
    0
  );

  return {
    e*idenceCount: evidence.length,
    *videnceStrength: Number(
      (to*al / evidence.length).toFixed(3)
 *  )
  };
}

export function compar*Evidence(
  left = [],
  right = [*
) {
  const a = scoreEvidence(lef*);
  const b = scoreEvidence(right*;

  return a.evidenceStrength >
 *  b.evidenceStrength
    ? "left"
*   : "right";
}

export default sc*reEvidence;
