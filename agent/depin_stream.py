from agent.agent_feed import build_agent_feed

def build_depin_event():
    feed = build_agent_feed()
    return {
        "type": "volata_intel",
        "ts": feed["timestamp"],
        "payload": feed,
    }
