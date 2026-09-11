def route_message(intel, target_agent_id: str):
    return {
        "to": target_agent_id,
        "type": "volata_intel",
        "payload": intel,
    }
