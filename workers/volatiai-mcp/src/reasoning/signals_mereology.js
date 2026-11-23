import graph from "../evidence_graph.json" with { type: "json" };
import { isMereological } from "./relations.js";

export async function signalsMereology(args = {}) {
  const node = args.node;
  if (!node) return { error: "Missing node" };

  const parts_of = [];    // node is part_of X
  const has_parts = [];   // X is part_of node
  const sees = [];        // node contains X
  const seen_by = [];     // X contains node

  for (const e of graph.edges) {
    if (!isMereological(e.relation)) continue;
    const r = String(e.relation).toLowerCase();
    if (e.source === node) {
      if (r === "part_of" || r === "member_of" || r === "belongs_to" || r === "constituent_of")
        parts_of.push({ target: e.target, relation: r, weight: e.weight });
      else if (r === "contains" || r === "composed_of" || r === "includes" || r === "has_part")
        sees.push({ target: e.target, relation: r, weight: e.weight });
    }
    if (e.target === node) {
      if (r === "part_of" || r === "member_of" || r === "belongs_to" || r === "constituent_of")
        seen_by.push({ source: e.source, relation: r, weight: e.weight });
      else if (r === "contains" || r === "composed_of" || r === "includes" || r === "has_part")
        has_parts.push({ source: e.source, relation: r, weight: e.weight });
    }
  }

  return {
    node,
    parts_of,
    has_parts,
    seen_by,
    sees,
    note: "Mereological structure only. These relations are structural, not causal. Use signals_simulate for causal propagation.",
  };
}
