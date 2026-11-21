import { loadGraph } from "./graph_store.js";

export function degreeCentrality(node){

  const g=loadGraph();

  return g.edges.filter(
    e=>e.source===node ||
       e.target===node
  ).length;
}
