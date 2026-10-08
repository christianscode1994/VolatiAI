export function evidenceWeight({

  provenanceDepth,

  corroborationCount,

  sourceIndependence,

  reputation

}) {

  return (

    provenanceDepth *

    sourceIndependence *

    (1 + corroborationCount)

    *

    (1 + reputation)

  );
}
