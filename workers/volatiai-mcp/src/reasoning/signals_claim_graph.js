import { loadGraph } from "./graph_store.js";

export async function signalsClaimGraph(args={}){

  const signal=args.signal;

  const g=loadGraph();

  return {
    signal,
    nodes:g.nodes,
    edges:g.edges.filter(
      e =>
      e.source===signal ||
      e.target===signal
    )
  };
}
