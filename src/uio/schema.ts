export type UIO = {
  timestamp: string;
  risk: {
    global: number;
    systemic: number;
    by_sector: { sector: string; score: number }[];
    narrative: number;
    flow: number;
    reliability: number;
  };
  opportunities: {
    sector: string;
    score: number;
    drivers: string[];
    type: string;
  }[];
  anomalies: any[];
  narrative: {
    headline: string;
    arcs: {
      topic: string;
      direction: "emerging" | "collapsing" | "polarizing";
      strength: number;
      velocity: number;
    }[];
    flags: string[];
  };
  flows: {
    sectors: any[];
    dynamics: {
      sector: string;
      acceleration: number;
      reversal: boolean;
      concentration: number;
    }[];
  };
  reliability: {
    global: number;
    components: {
      freshness: number;
      consistency: number;
      stability: number;
      coverage: number;
    };
  };
  graph: {
    centrality: Record<string, number>;
    clusters: string[][];
    hotspots: string[];
  };
  actions: {
    id: string;
    sector?: string;
    type: string;
    severity: "low" | "medium" | "high";
    reason: string;
  }[];
};
