from evidence.explain_event_runtime import explain
from evidence.rank_evidence import rank
from evidence.belief_runtime import belief
import json

event = "manufacturing"

result = {
    "event": event,
    "explanation": explain(event),
    "ranking": rank(event),
    "belief": belief(event)
}

print(
    json.dumps(
        result,
        indent=2
    )
)
