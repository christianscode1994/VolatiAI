from src.agent_runtime import SnapshotStore, ModeDetector

snap = SnapshotStore("agents/market_agent/memory.json")
mode = ModeDetector("https://api.coinpaprika.com/v1/global")
