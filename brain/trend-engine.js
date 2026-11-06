export function detectTrend(
  currentCount,
  previousCount
) {

  if (currentCount > previousCount) {

    return {
      direction: "up",
      strength:
        currentCount - previousCount
    };

  }

  if (currentCount < previousCount) {

    return {
      direction: "down",
      strength:
        previousCount - currentCount
    };

  }

  return {
    direction: "stable",
    strength: 0
  };

}
