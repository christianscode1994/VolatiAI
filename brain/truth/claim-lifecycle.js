export function createLifecycle(
  claim
) {

  return {

    claim,

    state: "asserted",

    support: 0,

    contradictions: 0,

    confidence: null,

    valuation: null
  };
}
