import graph from "../evidence_graph.json";

export async function signalsSimilarity(args={}) {

  const node = args.node;

  const neighbours = n => {

    const m = new Map();

    for(const e of graph.edges){

      if(e.source===n)
        m.set(e.target, Math.abs(e.weight||1));

      if(e.target===n)
        m.set(e.source, Math.abs(e.weight||1));
    }

    return m;
  };

  const A = neighbours(node);

  const results = [];

  const mode = (args.mode || "minmax").toLowerCase();

  if (mode === "jaccard") {
    const A = new Set(neighbours(node).keys());
    const results = [];
    for (const other of Object.keys(graph.nodes)) {
      if (other === node) continue;
      const B = new Set(neighbours(other).keys());
      const inter = [...A].filter(x => B.has(x));
      const union = new Set([...A, ...B]);
      const j = union.size > 0 ? inter.length / union.size : 0;
      results.push({
        node: other,
        jaccard: Number(j.toFixed(4)),
        shared_neighbors: inter.sort(),
        union_size: union.size,
      });
    }
    results.sort((a, b) => b.jaccard - a.jaccard);
    return results;
  }

  for(const other of Object.keys(graph.nodes)){

    if(other===node) continue;

    const B = neighbours(other);

    const keys = new Set([
      ...A.keys(),
      ...B.keys()
    ]);

    let minsum = 0;
    let maxsum = 0;

    for(const k of keys){

      const a = A.get(k)||0;
      const b = B.get(k)||0;

      minsum += Math.min(a,b);
      maxsum += Math.max(a,b);
    }

    results.push({
      node:other,
      similarity:maxsum
        ? Number((minsum/maxsum).toFixed(4))
        : 0
    });
  }

  results.sort((a,b)=>b.similarity-a.similarity);

  return {
    node,
    nearest:results.slice(0,20)
  };
}
