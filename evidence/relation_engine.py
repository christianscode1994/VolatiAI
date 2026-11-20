from evidence.query_graph import EvidenceQuery

class RelationEngine:

    def __init__(self):
        self.graph = EvidenceQuery().graph

    def relation(self, node, relation):

        return [
            edge
            for edge in self.graph["edges"]
            if edge["target"] == node
            and edge["relation"] == relation
        ]

    def supports(self, node):
        return self.relation(node, "supports")

    def contradicts(self, node):
        return self.relation(node, "contradicts")
