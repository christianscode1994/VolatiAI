# VolatiAI

Serverless crypto volatility & sentiment engine with:

- Free tier: CoinGecko + Reddit + Hacker News
- Pro tier: CoinGecko + Kraken + Reddit + Hacker News
- Acurast compute (updates outputs and pushes to GitHub)
- GitHub Pages hosting for dashboards
- Telegram bot (VolatiAI) for JSON delivery
- Key-based Pro access

## Outputs

- `public/free.json`, `public/free.html` – free tier
- `private/pro.json`, `private/pro.html` – Pro tier (Kraken data included)

## Run locally

```bash
pip install -r requirements.txt
python -m src.main
