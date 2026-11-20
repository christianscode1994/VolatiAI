from evidence.rank_evidence import rank
from evidence.belief_engine import BeliefEngine
import json

def belief(node):

    ranked = rank(node)

    confidence = min(
        1.0,
        ranked["score"] / 2.0
    )

    return {
        "event": node,
        "confidence": round(confidence, 4),
        "evidence_count": ranked["evidence_count"]
    }

if __name__ == "__main__":
    print(
        json.dumps(
            belief("manufacturing"),
            indent=2
        )
    )
