+ import random
+ import time
+
+
+ class Swarmer:
+     def __init__(self, id: int, mode: str):
+         self.id = id
+         self.mode = mode
+         self.mission = None
+
+     def compliance_safe_delay(self) -> float:
+         base = random.uniform(0.5, 2.0)
+         jitter = random.uniform(0.1, 0.5)
+         return base + jitter
+
+     def assign_unique_mission(self, missions: list[str]) -> None:
+         # deterministic, non‑overlapping mission assignment
+         self.mission = missions[self.id % len(missions)]
+
+     def run_compliance_safe(self):
+         time.sleep(self.compliance_safe_delay())
+         if self.mode == "light":
+             return self.run_light()
+         if self.mode == "medium":
+             return self.run_medium()
+         return self.run_full()
+
+     # below methods should call your existing collectors
+
+     def run_light(self):
+         self.collect_basic_market()
+         self.collect_basic_sentiment()
+
+     def run_medium(self):
+         self.collect_market()
+         self.collect_sentiment()
+         self.collect_dev_activity()
+
+     def run_full(self):
+         self.collect_market()
+         self.collect_sentiment()
+         self.collect_dev_activity()
+         self.collect_depth()
+         self.collect_rpc_truth()
