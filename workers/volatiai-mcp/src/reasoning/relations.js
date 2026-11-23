// Canonical relation classes. Every tool that traverses edges should use
// classify(relation) instead of comparing strings directly, so the graph can
// carry the full vocabulary without every tool needing to know all variants.

export const POSITIVE = new Set([
  "supports", "amplifies", "causes", "depends_on",
  "drives", "increases", "enables", "produces",
]);

export const NEGATIVE = new Set([
  "contradicts", "dampens", "inhibits", "reduces",
  "dampened_by", "blocks", "prevents",
]);

export function classify(relation) {
  if (!relation) return "neutral";
  const r = String(relation).toLowerCase();
  if (POSITIVE.has(r)) return "positive";
  if (NEGATIVE.has(r)) return "negative";
  return "neutral";
}

export function isTraversable(relation) {
  return classify(relation) !== "neutral";
}

export function sign(relation) {
  const c = classify(relation);
  if (c === "positive") return 1;
  if (c === "negative") return -1;
  return 0;
}
