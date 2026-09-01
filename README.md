# VolatiAI

VolatiAI is a serverless crypto intelligence engine combining **market volatility**,  
**social sentiment**, **exchange depth**, and now **developer activity signals**  
to detect early trends and narrative formation.

## Tiers

### Free Tier
Includes:
- CoinGecko market data
- Reddit sentiment
- Hacker News sentiment

Outputs:
- `public/free.json`
- `public/free.html`

### Pro Tier
Includes everything in Free **plus**:
- Kraken ticker, depth, OHLC
- GitHub developer‑activity signals
- Developer Sentiment Index (0–100)

Outputs:
- `private/pro.json`
- `private/pro.html`

## Features

- Market volatility scoring  
- Social sentiment scoring  
- Developer Sentiment Index (DSI)  
- Kraken depth analysis  
- GitHub repo activity + trending repos  
- Free + Pro tier separation  
- GitHub Pages hosting for dashboards  
- Telegram bot (VolatiAI) for JSON delivery  
- Key‑based Pro access (planned)

## Developer Sentiment Index (DSI)

A 0–100 score measuring:
- Stars  
- Forks  
- Watchers  
- Issue activity  
- Last push recency  
- Trending repo velocity  

Used to detect:
- Early ecosystem growth  
- New protocol adoption  
- AI/DePIN narrative formation  
- Pre‑market hype cycles  

## Outputs

Free:
- `public/free.json`
- `public/free.html`

Pro:
- `private/pro.json`
- `private/pro.html`

GitHub Pages (public):
- `docs/latest_free.json`
- `docs/summary_free.html`
- `docs/latest_pro.json`
- `docs/summary_pro.html`

## Run locally

```bash
pip install -r requirements.txt
python -m src.main
