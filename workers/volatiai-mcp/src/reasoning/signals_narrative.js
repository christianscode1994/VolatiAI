import { loadGraph } from "./graph_store.js";

export async function signalsNarrative(args={}) {

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

  return {
    signal,
    narrative:
      signal +
      " has " +
      support +
      " supporting relationships and " +
      contradictions +
      " contradicting relationships."
  };
}
