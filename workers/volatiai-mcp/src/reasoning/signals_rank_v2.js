import { degreeCentrality } from "./centrality.js";

export async function signalsRankV2(args={}) {

  const assets=args.assets||[];

  const ranked=assets.map(a=>{

    const score=
      (a.roc_z||0)*
      (a.persistence||1)*
      (a.corroboration||1)*
      (a.belief||1)*
      Math.max(
        degreeCentrality(a.signal),
        1
      );

    return {
      ...a,
      score
    };
  });

  ranked.sort(
    (a,b)=>b.score-a.score
  );

  return ranked;
}
