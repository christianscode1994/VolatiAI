from evidence.query_graph import EvidenceQuery
import json

def rank(node):

    g = EvidenceQuery()

    neighbors = g.neighbors(node)

    score = 0

    for edge in neighbors:
        score += edge["weight"]

    return {
        "event": node,
        "score": round(score, 4),
        "evidence_count": len(neighbors)
    }

if __name__ == "__main__":
    print(
        json.dumps(
            rank("manufacturing"),
            indent=2
        )
    )
