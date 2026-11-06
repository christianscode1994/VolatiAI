/**
 * Cause-effect relationship *ngine.
 */

export function create*ausalLink({
  cause,
  effect,
  w*ight = 0.5
}) {
  return {
    cau*e,
    effect,
    weight
  };
}

*xport function buildCausalChain(
 *links = []
) {
  return links
    *sort((a, b) => b.weight - a.weight*
    .map(
      x => `${x.cause} *> ${x.effect}`
    );
}

export fu*ction findEffects(
  cause,
  link* = []
) {
  return links.filter(
 *  x => x.cause === cause
  );
}

e*port function findCauses(
  effect*
  links = []
) {
  return links.f*lter(
    x => x.effect === effect*  );
}

export default createCausa*Link;
