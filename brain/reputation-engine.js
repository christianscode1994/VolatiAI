export function updateReputation(
  history
) {

  const reputation = {};

  for (const item of history) {

    const theme = item.theme;

    if (!reputation[theme]) {

      reputation[theme] = 0;

    }

    reputation[theme]++;

  }

  return reputation;

}
