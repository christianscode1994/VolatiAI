# modules/agents/base_agent.py

class BaseAgent:
    def __init__(self, uio):
        self.uio = uio

    def run(self):
        raise NotImplementedError
