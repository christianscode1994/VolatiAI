import json

class EvidenceQuery:

    def __init__(self, path="data/graph/evidence_graph.json"):
        with open(path) as f:
            self.graph = json.load(f)

    def neighbors(self, node):
        out = []

        for edge in self.graph["edges"]:
            if edge["target"] == node:
                out.append(edge)

            elif edge["source"] == node:
                out.append(edge)

        return out
