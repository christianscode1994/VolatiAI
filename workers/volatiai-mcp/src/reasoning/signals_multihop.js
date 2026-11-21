import { loadGraph } from "./graph_store.js";

export async function signalsMultihop(args={}) {

  const graph=loadGraph();

  const signal=args.signal;
  const depth=args.depth || 5;

  const paths=[];

  function dfs(node,path,d){

    if(d<=0){
      paths.push(path);
      return;
    }

    const edges=
      graph.edges.filter(
        e=>e.source===node
      );

    if(edges.length===0){
      paths.push(path);
      return;
    }

    for(const e of edges){
      dfs(
        e.target,
        [...path,e.target],
        d-1
      );
    }
  }

  dfs(signal,[signal],depth);

  return {
    signal,
    depth,
    paths
  };
}
