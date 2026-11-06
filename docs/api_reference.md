
---

# 📄 **docs/api_reference.md**

```md
# VolatiAI API Reference  
Hybrid Tone — Technical + Expressive

VolatiAI does not expose a cloud API.  
All APIs referenced here are **local**, **offline**, and **serverless**.

This reference describes the internal JSON structures used by agents, fusion, and intelligence layers.

---

# 🧩 Agent Output Format

Each agent returns:

```json
{
  "agent": "market",
  "timestamp": 1690000000,
  "signals": {
    "volatility": 0.42,
    "acceleration": 0.18,
    "stress": 0.33
  }
}
