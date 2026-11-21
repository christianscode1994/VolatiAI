import graph from "./evidence_graph.json";

export async function signalsExplain(args = {}) {

  const signal = String(args.signal || "");

  const evidence = graph.edges.filter(
    e => e.source === signal || e.target === signal
  );

  return {
    signal,
    evidence_count: evidence.length,
    evidence
  };
}
