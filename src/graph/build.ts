import { SectorGraph } from "./model";

export function buildGraphFromFlows(flows: any): SectorGraph {
  const nodes = flows.sectors.map((s: any) => ({
    id: s.id,
    label: s.label,
  }));

  const edges = flows.edges.map((e: any) => ({
    from: e.from,
    to: e.to,
    weight: e.weight,
  }));

  return { nodes, edges };
}
