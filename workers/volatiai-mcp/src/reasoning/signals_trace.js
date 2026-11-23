import { isTraversable } from "./relations.js";
import { loadGraph } from "./graph_store.js";

export async function signalsTrace(args={}) {

  const signal=args.signal;

  const g=loadGraph();

  const visited=new Set();
  const queue=[signal];

  const trace=[];

  while(queue.length){

    const node=queue.shift();

    if(visited.has(node))
      continue;

    visited.add(node);

    const edges=g.edges.filter(
      e=>e.source===node
    );

    trace.push(...edges);

    for(const e of edges)
      queue.push(e.target);
  }

  return {
    signal,
    visited:[...visited],
    trace
  };
}
