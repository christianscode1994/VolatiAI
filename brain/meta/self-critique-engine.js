/**
 * Examine weaknesses in a conclu*ion
 */

export function selfCriti*ue({
  confidence = 0,
  sourceCou*t = 0,
  contradictionCount = 0
} * {}) {

  const weaknesses = [];

* if (sourceCount < 3) {
    weakne*ses.push(
      "insufficient-sour*e-diversity"
    );
  }

  if (con*radictionCount > 0) {
    weakness*s.push(
      "contradictory-evide*ce-present"
    );
  }

  const re*isedConfidence =
    Math.max(
   *  0,
      confidence - (weaknesse*.length * 0.1)
    );

  return {
*   weaknesses,
    revisedConfiden*e: Number(
      revisedConfidence*toFixed(3)
    )
  };
}

export de*ault selfCritique;
