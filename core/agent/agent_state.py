@dataclass
class AgentState:
    agent_id: str
    vai_score: int  # internal score, not exposed to users
    role: str
    capabilities: dict
