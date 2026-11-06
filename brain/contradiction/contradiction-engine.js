/**
 * Detect conflicting claims.
 */

const NEGATION_PAIRS = [
  ["up", "down"],
  ["increase", "decrease"],
  ["bullish", "bearish"],
  ["growth", "decline"],
  ["positive", "negative"],
  ["higher", "lower"],
  ["rising", "falling"]
];

export function detectContradictions(claims = []) {
  const contradictions = [];

  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const a = JSON.stringify(claims[i]).toLowerCase();
      const b = JSON.stringify(claims[j]).toLowerCase();

      for (const [x, y] of NEGATION_PAIRS) {
        if (
          (a.includes(x) && b.includes(y)) ||
          (a.includes(y) && b.includes(x))
        ) {
          contradictions.push({
            claimA: claims[i],
            claimB: claims[j],
            conflict: `${x}-${y}`,
            severity: 0.8
          });
        }
      }
    }
  }

  return contradictions;
}

export function contradictionScore(
  contradictions = [],
  totalClaims = 1
) {
  return Number(
    Math.min(
      1,
      contradictions.length / totalClaims
    ).toFixed(3)
  );
}

export default detectContradictions;
