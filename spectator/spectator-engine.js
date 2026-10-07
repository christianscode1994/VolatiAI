export function observe(intelligence) {

  return {
    timestamp: Date.now(),
    signals: intelligence.length
  };

}
