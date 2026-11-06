# VolatiAI Installation Guide  
Hybrid Tone — Technical + Expressive

VolatiAI is designed to be **local**, **offline‑capable**, **serverless**, and **anti‑compliance**.  
Installation is intentionally simple, requiring no accounts, no cloud services, no telemetry, and no identity.

This guide explains how to install, activate, and run VolatiAI on your machine.

---

# 🧩 System Requirements

VolatiAI is lightweight and runs on almost any machine.

### **Minimum Requirements**
- macOS, Linux, or Windows  
- Node.js 18+  
- Git  
- 200 MB free disk space  
- Internet (optional — only needed for initial install)

### **Offline Mode**
After installation, VolatiAI runs fully offline:

- activation  
- local runner  
- intelligence layer  
- dashboards  
- snapshots  

No servers are contacted.

---

# 📦 Installation Steps

## **1. Clone the Repository**

```bash
git clone https://github.com/christianscode1994/VolatiAI.git
cd VolatiAI

his downloads the full project locally.

2. Install Dependencies
VolatiAI uses a minimal dependency set.

bash
npm install
This installs:

local runner

agent orchestrators

dashboard generator

activation utilities

No cloud SDKs.
No telemetry packages.
No analytics libraries.

3. Run Initial Setup
bash
npm run setup
This step:

creates local config directories

prepares config/activation.json

initializes offline mode

verifies environment

No servers are contacted.

🔑 Activation
VolatiAI uses offline activation keys (VAI‑LIC).
They unlock the full intelligence engine locally, without accounts or subscriptions.

4. Enter Activation Key
bash
npm run activate
You will be prompted to enter a key such as:

Kod
VAI-LIC-ABCD-1234-EFGH
Activation is:

offline

local

stateless

non‑tracking

non‑identifying

Your key is stored in:

Kod
config/activation.json
🚀 Running VolatiAI
5. Start the Local Runner
bash
npm run local
This executes:

all offline agents

fusion layer

intelligence layer

snapshot generator

Outputs are written to:

Kod
public/intel.json
public/intel.html
public/summary.html
public/latest.json
📊 Viewing the Dashboard
6. Open the Dashboard Locally
Open:

Kod
public/intel.html
This shows:

trend acceleration

narrative velocity

whale pressure

spoofing probability

chain truth

sector growth

ecosystem stress

No cloud hosting required.

📴 Offline Mode
VolatiAI runs fully offline after installation:

agents execute locally

intelligence layer runs locally

dashboards render locally

activation is local

no telemetry

no identity

no compliance surface

Offline mode is ideal for:

air‑gapped machines

private research environments

secure networks

personal setups

🔄 Updating VolatiAI
Updates are local and offline‑friendly.

7. Pull Latest Changes
bash
git pull
npm install
No cloud accounts.
No update servers.
No tracking.

🛠️ Troubleshooting
Install fails
Ensure Node.js 18+

Ensure Git is installed

Ensure directory permissions are correct

Activation fails
Check for typos

Delete config/activation.json and retry

Ensure the key matches expected format

Dashboard not updating
Run npm run local again

Ensure public/ is writable

🧭 Summary
VolatiAI installation is intentionally:

simple

offline‑capable

serverless

stateless

anti‑compliance

lightweight

You install it once, activate it locally, and run it anywhere — without accounts, subscriptions, telemetry, or cloud dependencies.

VolatiAI is a tool, not a service.



