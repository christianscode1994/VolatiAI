from evidence.explain_event_runtime import explain
from evidence.rank_evidence import rank
from evidence.belief_runtime import belief
from evidence.relation_engine import RelationEngine
from evidence.path_search import PathSearch
import json

event = "manufacturing"

relations = RelationEngine()
paths = PathSearch()

result = {
    "event": event,

    "explanation": explain(event),

    "supports": relations.supports(event),

    "contradictions": relations.contradicts(event),

    "path_to_gdp": paths.find_paths(
        "copper",
        "gdp_growth"
    ),

    "ranking": rank(event),

    "belief": belief(event)
}

print(
    json.dumps(
        result,
        indent=2
    )
)
