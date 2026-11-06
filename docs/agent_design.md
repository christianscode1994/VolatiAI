# VolatiAI Agent Design  
Hybrid Tone — Technical + Expressive

Agents are the autonomous workers of VolatiAI.  
Each agent is independent, stateless, offline‑capable, and deterministic.

Agents produce structured signals that feed the fusion layer.

---

# 🧩 Agent Structure

Each agent follows this pattern:

```json
{
  "agent": "market",
  "timestamp": 1690000000,
  "signals": {
    "metric_1": 0.42,
    "metric_2": 0.18,
    "metric_3": 0.33
  }
}

Components
agent name

timestamp

signals object

deterministic scoring

🔥 Core Agents
Market Agent
volatility

acceleration

stress

Sentiment Agent
narrative velocity

social momentum

Developer Agent
repo velocity

ecosystem growth

Depth Agent
whale pressure

spoofing probability

Truth Agent
RPC truth

chain divergence

🌐 Sector Agents (100+)
Each sector agent focuses on one domain:

AI

DePIN

Web3 infra

macro

alt‑data

chain analytics

Example:

json
{
  "agent": "sector_ai",
  "signals": {
    "growth": 0.72,
    "stress": 0.21,
    "narrative": 0.44
  }
}
🧭 Summary
Agents are the foundation of VolatiAI — autonomous, offline, serverless, and anti‑compliance.

