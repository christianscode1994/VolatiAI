import { UIO } from "./schema";

export function buildUIO(params: {
  timestamp: string;
  risk: any;
  opportunities: any[];
  anomalies: any[];
  narrative: any;
  flows: any;
  reliability: any;
  graph: any;
  actions: any[];
}): UIO {
  return {
    timestamp: params.timestamp,
    risk: {
      global: params.risk.globalRisk,
      systemic: params.risk.systemic ?? params.risk.globalRisk,
      by_sector: params.risk.sectorRisk ?? [],
      narrative: params.risk.narrative ?? 0,
      flow: params.risk.flow ?? 0,
      reliability: params.risk.reliability ?? 0,
    },
    opportunities: params.opportunities,
    anomalies: params.anomalies,
    narrative: params.narrative,
    flows: {
      sectors: params.flows.sectors,
      dynamics: params.flows.dynamics,
    },
    reliability: {
      global: params.reliability.global,
      components: params.reliability.components,
    },
    graph: {
      centrality: params.graph.centrality,
      clusters: params.graph.clusters,
      hotspots: params.graph.hotspots,
    },
    actions: params.actions,
  };
}
