export class ContradictionGraph {
  constructor() {
    this.nodes = new Map();
    this.edges = [];
  }

  addClaim(claim) {
    this.nodes.set(claim.id, claim);
  }

  contradicts(a, b, reason = "") {
    this.edges.push({
      source: a,
      target: b,
      type: "contradicts",
      reason
    });
  }

  getContradictions(id) {
    return this.edges.filter(
      e => e.source === id ||
           e.target === id
    );
  }
}
