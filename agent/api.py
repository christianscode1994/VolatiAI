from fastapi import FastAPI
from agent.agent_feed import build_agent_feed
from agent.agent_uio import build_agent_uio

app = FastAPI()

@app.get("/agent/feed")
def agent_feed():
    return build_agent_feed()

@app.get("/agent/uio")
def agent_uio():
    return build_agent_uio()
