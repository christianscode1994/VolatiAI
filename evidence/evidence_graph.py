from dataclasses import dataclass

@dataclass
class Edge:
    source: str
    target: str
    relation: str
    weight: float


class EvidenceGraph:
    def __init__(self):
        self.nodes = {}
        self.edges = []

    def add_node(self, node, score=0):
        self.nodes[node] = score

    def add_edge(self, source, target, relation, weight):
        self.edges.append(
            Edge(source, target, relation, weight)
        )
