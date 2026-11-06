# VolatiAI Local Runner  
Hybrid Tone — Technical + Expressive

The **Local Runner** is the offline execution engine of VolatiAI.  
It runs all agents, fuses signals, generates intelligence snapshots, and renders dashboards — entirely on your machine, with **no servers, no accounts, no telemetry, and no compliance surface**.

The Local Runner is what makes VolatiAI a **tool**, not a service.

---

# 🌐 Purpose of the Local Runner

The Local Runner is responsible for:

- executing all offline agents  
- ingesting local or cached data  
- running the fusion layer  
- running the intelligence layer  
- generating unified intelligence snapshots  
- updating `intel.json`, `intel.html`, `summary.html`, `latest.json`  
- powering the dashboard  

It is the core of VolatiAI’s offline‑first architecture.

---

# 🧩 How the Local Runner Works

The Local Runner follows a deterministic pipeline:

### **1. Agent Execution**
Runs all offline‑capable agents:

- Market Agent  
- Sentiment Agent  
- Developer Agent  
- Depth Agent  
- Truth Agent  
- 100+ Sector Agents  

Each agent produces a structured JSON payload.

### **2. Fusion Layer**
Normalizes, weights, scores, and merges all agent outputs.

### **3. Intelligence Layer**
Transforms fused signals into:

- Trend Acceleration  
- Narrative Velocity  
- Whale Pressure  
- Spoofing Probability  
- Chain Truth  
- Sector Growth  

### **4. Snapshot Generation**
Writes unified intelligence snapshots to:

public/intel.json
public/intel.html
public/summary.html
public/latest.json



### **5. Dashboard Rendering**
The dashboard reads these files and displays real‑time intelligence.

---

# 🚀 Running the Local Runner

To start the Local Runner:

```bash
npm run local

This command:

executes all agents

runs fusion + intelligence layers

generates snapshots

updates the dashboard

No internet required.

📴 Offline Mode
The Local Runner is fully offline:

no API calls

no RPC calls

no cloud dependencies

no telemetry

no identity

no tracking

Offline mode is ideal for:

air‑gapped machines

private research environments

secure networks

personal setups

VolatiAI remains fully functional without internet access.

📊 Output Files
The Local Runner generates four key files:

1. intel.json
Raw intelligence snapshot.

2. intel.html
Full dashboard view.

3. summary.html
Condensed dashboard view.

4. latest.json
Minimal snapshot for automation or scripting.

These files are updated every time the Local Runner executes.

🧱 Local Runner Architecture

╔══════════════════════════════════════╗
║            Local Runner              ║
╚═══════════════╦══════════════════════╝
                │
                ▼
╔══════════════════════════════════════╗
║            Agent Execution           ║
║  • Market Agent                      ║
║  • Sentiment Agent                   ║
║  • Developer Agent                   ║
║  • Depth Agent                       ║
║  • Truth Agent                       ║
║  • Sector Agents (100+)              ║
╚═══════════════╦══════════════════════╝
                │
                ▼
╔══════════════════════════════════════╗
║             Fusion Layer             ║
╚═══════════════╦══════════════════════╝
                │
                ▼
╔══════════════════════════════════════╗
║          Intelligence Layer          ║
╚═══════════════╦══════════════════════╝
                │
                ▼
╔══════════════════════════════════════╗
║         Snapshot Generation          ║
║  • intel.json                        ║
║  • intel.html                        ║
║  • summary.html                      ║
║  • latest.json                       ║
╚══════════════════════════════════════╝


🛠️ Troubleshooting
Runner fails to start
Ensure Node.js 18+

Ensure dependencies are installed (npm install)

Ensure activation is complete

Dashboard not updating
Delete old files in public/

Run npm run local again

Snapshots missing
Ensure public/ directory is writable

Ensure agents are not throwing errors

Offline mode issues
Delete config/activation.json and re‑activate

Ensure no external dependencies are required

🔐 Anti‑Compliance Design
The Local Runner is intentionally:

serverless

stateless

offline‑capable

non‑tracking

non‑identifying

non‑persistent

It avoids:

GDPR retention

SOC2 logging

PCI compliance

identity systems

telemetry pipelines

cloud infrastructure

VolatiAI remains outside corporate gravity.

🧭 Summary
The Local Runner is the offline execution engine of VolatiAI.
It runs agents, fuses signals, generates intelligence, and updates dashboards — all locally, without servers, accounts, telemetry, or compliance overhead.

VolatiAI is a tool, not a service.

