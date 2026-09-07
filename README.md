# VolatiAI

VolatiAI is a serverless crypto intelligence engine combining **market volatility**,  
**social sentiment**, **exchange depth**, **developer activity signals**,  
and **multi‑chain truth** to detect early trends and narrative formation.  
It also supports **full offline mode** using cached snapshots and local fallback agents.

---

## Tiers

### Free Tier

**Includes:**
- CoinGecko market data  
- CoinPaprika market data  
- Reddit sentiment (Pushshift)  
- Hacker News sentiment  
- Nitter sentiment  
- Etherscan public API (free endpoints)

**Outputs:**
- `public/free.json`  
- `public/free.html`

---

### Pro Tier

**Includes everything in Free plus:**
- Kraken ticker, depth, OHLC  
- Multi‑exchange depth (Binance, Coinbase, Crypto.com, Bybit, OKX)  
- Whale Pressure Index  
- Spoofing detection  
- Liquidity migration  
- Arbitrage deltas  
- Depth heatmaps  
- GitHub developer‑activity signals  
- Developer Sentiment Index (0–100)  
- Multi‑chain truth (Magic Eden RPC, Infura, Alchemy free tier)  
- Advanced Etherscan analytics (contract activity, transaction patterns)

**Outputs:**
- `private/pro.json`  
- `private/pro.html`

---

## Features

- Market volatility scoring  
- Social sentiment scoring  
- Developer Sentiment Index (DSI)  
- Multi‑exchange depth analysis  
- Whale pressure engine  
- Spoofing detector  
- Liquidity migration tracking  
- Arbitrage delta computation  
- Depth heatmap generation  
- Free + Pro tier separation  
- GitHub Pages hosting for dashboards  
- Telegram bot (VolatiAI) for JSON delivery  
- Key‑based Pro access (planned)  
- Offline mode using snapshots + trend extrapolation  
- Portable agent runtime (GitHub, local machines, offline)

---

## Intelligence Layer

VolatiAI builds a **multi‑signal intelligence engine** on top of raw data:

- **Trend Acceleration Engine**  
  Tracks first‑derivative changes in volatility, sentiment, and developer activity to detect early trend formation and momentum shifts.

- **Narrative Timeline Engine**  
  Monitors AI and DePIN narratives across Reddit, Hacker News, Nitter, and GitHub to capture emerging narratives and narrative decay.

- **Microstructure Engine**  
  Analyzes exchange depth to estimate whale pressure, spoofing probability, and liquidity stress.

- **RPC Truth Engine**  
  Cross‑checks multiple blockchain RPCs (Infura, Alchemy, etc.) to compute a “truth score” for chain data consistency.

All of these signals are visualized in the **Pro dashboard** via:

- Volatility curve (30‑day)  
- Depth heatmap  
- Trend acceleration bars  
- Narrative timeline chart  
- Whale pressure bars  
- Spoofing probability meter  
- RPC truth bar

---

## Developer Sentiment Index (DSI)

A **0–100 score** measuring:
- Stars  
- Forks  
- Watchers  
- Issue activity  
- Last push recency  
- Trending repo velocity  

**Used to detect:**
- Early ecosystem growth  
- New protocol adoption  
- AI/DePIN narrative formation  
- Pre‑market hype cycles  

---

## Outputs

### Free
- `public/free.json`  
- `public/free.html`

### Pro
- `private/pro.json`  
- `private/pro.html`

### GitHub Pages (public)
- `docs/latest_free.json`  
- `docs/summary_free.html`  
- `docs/latest_pro.json`  
- `docs/summary_pro.html`

---

## Dashboard Preview (Pro Tier)

```text
┌───────────────────────────────────────────────┐
│                VolatiAI – Pro Tier            │
├───────────────────────────────────────────────┤
│ Trend Index: 78                                │
│ Liquidity Index: 64                            │
│ AI/DePIN Narrative Index: 52                   │
│ Developer Sentiment Index: 71                  │
├───────────────────────────────────────────────┤
│ Volatility (30‑day)                            │
│   ╰───╮╭──────╯╰───────╮╭───────╯             │
├───────────────────────────────────────────────┤
│ Depth Heatmap                                  │
│ ████ ███ █████ ███ ███ ███ ███ ███ ███ ███    │
├───────────────────────────────────────────────┤
│ Trend Acceleration                             │
│ Vol: ▇▇▇▇▇   Sent: ▇▇▇▇   DSI: ▇▇▇▇▇▇          │
├───────────────────────────────────────────────┤
│ Narrative Timeline                              │
│ AI:   ╰──╮╭────╯╰──╮╭────╯                     │
│ DePIN: ╰────╮╭────╯╰────╮                     │
├───────────────────────────────────────────────┤
│ Whale Pressure                                 │
│ ▇▇▇▇▇▇▇▇▇▇                                    │
├───────────────────────────────────────────────┤
│ Spoofing Probability: ████████████ 72%         │
├───────────────────────────────────────────────┤
│ RPC Truth Score: ████████████████████ 100%     │



Run locally
bash
pip install -r requirements.txt
python -m src.main --tier free
python -m src.main --tier pro



Serverless AI/DePIN crypto intelligence engine.

---

## What VolatiAI does

VolatiAI fuses:

- Market volatility  
- Social sentiment  
- Exchange depth  
- Developer activity  
- Multi‑chain RPC truth  

to detect:

- Emerging narratives  
- Trend acceleration  
- Whale pressure  
- Spoofing probability  
- Chain data divergence  

---

## Dashboards

- **Free dashboard:** `summary_free.html`  
- **Pro dashboard:** `summary_pro.html`  

These are regenerated every 15 minutes via GitHub Actions.

---

## Architecture

- Autonomous agents (market, sentiment, developer)  
- Scoring + fusion layer (Free + Pro)  
- Intelligence layer (trends, narratives, microstructure, RPC truth)  
- HTML dashboards (Free + Pro)  
- GitHub Pages hosting  
- Optional Telegram bot output

---

## Usage

- View dashboards via GitHub Pages  
- Run locally with:

```bash
pip install -r requirements.txt
python -m src.main --tier free
python -m src.main --tier pro







└───────────────────────────────────────────────┘
