export function reason(convergences) {

  return convergences.map(c => ({
    insight:
      `${c.source} is increasingly associated with ${c.target}`
  }));

}
