import { loadGraph } from "./graph_store.js";

export async function signalsArbitrate(args={}) {

  const signal=args.signal;

  const g=loadGraph();

  const support=g.edges.filter(
    e=>e.target===signal &&
    e.relation==="supports"
  ).length;

  const contradictions=g.edges.filter(
    e=>e.target===signal &&
    e.relation==="contradicts"
  ).length;

  const belief=
    (support+1)/
    (support+contradictions+2);

  return {
    signal,
    belief,
    confidence:
      support+contradictions
      ? support/(support+contradictions)
      : 0,
    uncertainty:
      support+contradictions
      ? contradictions/(support+contradictions)
      : 1
  };
}
