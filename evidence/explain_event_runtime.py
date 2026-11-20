from evidence.query_graph import EvidenceQuery
import json

def explain(node):

    g = EvidenceQuery()

    neighbors = g.neighbors(node)

    return {
        "event": node,
        "evidence": neighbors
    }

print(json.dumps(
    explain("manufacturing"),
    indent=2
))
