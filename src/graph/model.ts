export type SectorNode = {
  id: string;      // "dev", "social", "derivatives", ...
  label: string;
};

export type SectorEdge = {
  from: string;
  to: string;
  weight: number;  // flow strength / influence
};

export type SectorGraph = {
  nodes: SectorNode[];
  edges: SectorEdge[];
};
