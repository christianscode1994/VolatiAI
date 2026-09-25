def build_timeline(snapshot: dict) -> dict:
    return {
        "generated_at": snapshot["generated_at"],
        "timeline": snapshot["narrative"]["timeline"]
    }
