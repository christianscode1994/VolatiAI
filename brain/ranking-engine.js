export function rank(item) {

  return {
    ...item,
    score: Math.floor(Math.random() * 100)
  };

}
``
