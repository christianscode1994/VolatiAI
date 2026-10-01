
---

# 📄 **docs/configuration.md**

```md
# VolatiAI Configuration  
Hybrid Tone — Technical + Expressive

VolatiAI uses minimal configuration to preserve its serverless, stateless, offline‑capable architecture.

All configuration is local.

---

# 🧩 Config Directory

config/
activation.json
settings.json
runner.json


---

# 🔑 activation.json

```json
{
  "activated": true,
  "license": "VAI-LIC-XXXX-XXXX-XXXX"
}

Local only.
Never transmitted.

⚙️ settings.json

{
  "dashboard_theme": "dark",
  "update_interval": 300,
  "offline_mode": true
}

🏃 runner.json


{
  "parallel_agents": true,
  "max_agents": 50,
  "snapshot_path": "public/"
}









