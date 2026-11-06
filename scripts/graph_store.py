#!/usr/bin/env python3
"""Persist graph between runs for temporal comparison."""

import json
from datetime import datetime
from pathlib import Path

GRAPH_PATH = "data/graph_snapshot.json"
MAX_SNAPSHOTS = 7  # keep 7 days of graph history


def load_graph():
    try:
        with open(GRAPH_PATH) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"snapshots": []}


def save_graph(store):
    Path(GRAPH_PATH).parent.mkdir(parents=True, exist_ok=True)
    store["snapshots"] = store["snapshots"][-MAX_SNAPSHOTS:]
    with open(GRAPH_PATH, "w") as f:
        json.dump(store, f, indent=2)


def snapshot(graph):
    """Append current graph to persistent store."""
    store = load_graph()
    store["snapshots"].append({
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "node_count": len(graph.get("nodes", [])),
        "edge_count": len(graph.get("edges", [])),
        "nodes": graph.get("nodes", []),
        "edges": graph.get("edges", []),
    })
    save_graph(store)
    return store


def compare_to_previous(graph):
    """Compare current graph to the previous snapshot."""
    store = load_graph()
    if len(store["snapshots"]) < 2:
        return {"status": "no_previous_snapshot"}

    prev = store["snapshots"][-2]
    curr_claims = {n["id"]: n for n in graph.get("nodes", []) if n.get("type") == "claim"}
    prev_claims = {n["id"]: n for n in prev.get("nodes", []) if n.get("type") == "claim"}

    new_claims = set(curr_claims) - set(prev_claims)
    dropped_claims = set(prev_claims) - set(curr_claims)
    persisted = set(curr_claims) & set(prev_claims)

    changed = []
    for cid in persisted:
        c_curr = curr_claims[cid]
        c_prev = prev_claims[cid]
        if c_curr.get("summary") != c_prev.get("summary"):
            changed.append({
                "id": cid,
                "sector": c_curr.get("sector"),
                "prev_summary": c_prev.get("summary"),
                "curr_summary": c_curr.get("summary"),
            })

    return {
        "new_claims": len(new_claims),
        "dropped_claims": len(dropped_claims),
        "persisted": len(persisted),
        "changed": changed,
        "snapshot_age_runs": len(store["snapshots"]),
    }


if __name__ == "__main__":
    # Test: build synthetic graph, snapshot, compare
    g = {"nodes": [{"id": "test1", "type": "claim", "summary": "foo"}], "edges": []}
    store = snapshot(g)
    print(f"OK — snapshot {len(store['snapshots'])} saved")
    g2 = {"nodes": [{"id": "test2", "type": "claim", "summary": "bar"}], "edges": []}
    snapshot(g2)
    diff = compare_to_previous(g2)
    print(f"OK — diff: {diff}")
