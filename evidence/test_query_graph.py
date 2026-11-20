import json

with open("data/graph/evidence_graph.json") as f:
    graph = json.load(f)

node = "manufacturing"

neighbors = []

for edge in graph["edges"]:
    if edge["target"] == node:
        neighbors.append({
            "source": edge["source"],
            "relation": edge["relation"],
            "weight": edge["weight"]
        })

print(json.dumps({
    "node": node,
    "neighbors": neighbors
}, indent=2))
