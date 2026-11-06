from src.runtime.env import detect_platform

PLATFORM = detect_platform()

if PLATFORM == "cloudflare":
    MAX_AGENTS = 5
    SNAPSHOT_INTERVAL = 10  # minutes
elif PLATFORM == "vercel":
    MAX_AGENTS = 3
    SNAPSHOT_INTERVAL = 15
elif PLATFORM == "fly":
    MAX_AGENTS = 12
    SNAPSHOT_INTERVAL = 5
else:
    MAX_AGENTS = 8
    SNAPSHOT_INTERVAL = 10
