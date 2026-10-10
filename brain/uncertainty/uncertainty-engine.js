/**
 * Measur*s how uncertain a conclusion is
 **

export function uncertainty({
  *onfidence = 0,
  evidenceCount = 0*
  contradictionCount = 0
} = {}) *

  const evidenceGap =
    Math.m*x(0, 10 - evidenceCount) / 10;

  *onst contradictionPenalty =
    co*tradictionCount * 0.1;

  const un*ertaintyScore =
    Math.min(
    * 1,
      (1 - confidence) +
     *evidenceGap +
      contradictionP*nalty
    );

  return {
    confi*ence,
    uncertainty: Number(
   *  uncertaintyScore.toFixed(3)
    *
  };
}

export default uncertaint*;
