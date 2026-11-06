# VolatiAI — Contributor Guide

## Design principles (non-negotiable)

1. **Stateless consumers.** Anything that reads VolatiAI — `volatiai_brief.py`, `volatiai_alert.py`, future dashboards — holds no state. Run it from any machine, get the same answer.
2. **Serverless producers.** Only the Worker cron writes state. No database server, no queue, no VM.
3. **Keyless sources.** Every data source is a public API. No secrets to rotate, no compliance review, no vendor contracts.
4. **Zero marginal cost.** Cloudflare free tier: 1000 KV writes/day, 100k reads/day, 10M Worker invocations/month. 292 sectors × 1 cron/day = 292 writes = **0.03% of budget**.
5. **Ephemeral state.** All data in KV with 31-day TTL. Delete the namespace → tomorrow the pipeline rebuilds itself from scratch.
6. **Outside corporate compliance scope by construction.** No PII. No positions. No PII. No keys. No server to patch. No DB to back up. Nothing to audit.

Any proposed change that violates one of these is rejected — no matter how clever.

## Git discipline (mandatory order)

    git add -A
    git commit -m "..."
    git pull --rebase origin main
    git push origin main

**Never `git pull` before `commit`.** Scripts that write files leave the tree dirty; pull fails every single time. Learned across 6 rounds.

## Adding a new sector

1. **Verify from Workers egress, not your laptop.** Terminal 1: `npx wrangler tail --format pretty` (leave running). Terminal 2: hit the endpoint. Look for `http_403`, `http_451`, `curl 56`.
2. Add to `config/active_sectors.json` and `config/source_licenses.json` with a real license (`category: "open"`).
3. Add `"<sector>"` to `SLOW_SECTORS` in `scripts/epistemic_digest.py`.
4. Add worker block in `workers/sector-slow/src/index.js` before `};\n\nfunction json`.
5. `node --check workers/sector-slow/src/index.js && python3 scripts/audit_sectors.py`
6. Commit → pull → push → deploy.

## Cloudflare-Workers-safe source list

| Source | From Workers? | Notes |
| :--- | :--- | :--- |
| Frankfurter / ECB | yes | daily reference rates |
| NBP (Poland) | yes | FX + gold |
| World Bank | yes | annual macro |
| Kraken public | yes | spot prices |
| Coinbase Exchange public | yes | spot + volume |
| DefiLlama | yes | DeFi protocols |
| GLEIF | yes | legal entity registry |
| SEC EDGAR | yes | needs email in User-Agent |
| DBnomics | yes | aggregator (IMF, WB) |
| CoinGecko free | flaky | 429s under shared egress |
| Binance | no | geo-blocked |
| DexScreener | no | WAF |
| BLS v1 | no | 25 req/day per IP |
| Treasury Fiscal Data | no | Akamai WAF |

**Rule:** if the API docs mention rate limits, WAF, or "datacenter IPs" — test before deploying.

## KV key pattern (do not deviate)

Worker uses:  `${sectorName}_${config.metric}_history`

Examples:
- `kraken-btc-usd_btc_usd_history`
- `coinbase-btc-volume24h_btc_quote_volume_usd_history`
- `frankfurter-eurusd_eur_usd_history`

Orphan keys (`history:<sector>`, `sector:<sector>`) are silently ignored. If a backfill doesn't show up in `/signal`, first run `grep -n "kvKey" workers/sector-slow/src/index.js`.

## KV write budget — actual behavior

The worker writes to KV **only when the value changed or the calendar day rolled over**. Response field `kv_put_skipped: "unchanged_today"` proves it. So:

- Polling a stable sector (VIX, DXY, gold) — **free**, no writes
- Polling BTC — 1 write per second (value changes constantly)
- Daily cron — 292 writes (one per sector per day)

Real budget is much safer than the original worst-case estimate.

| Call | Writes |
| :--- | :--- |
| `GET /<sector>/signal` | 1 per sector |
| Cron (03:17 UTC, all 292) | 292 |
| `./volatiai_brief.py` (all 292) | 292 |
| `./volatiai_alert.py` (all 292) | 292 |

Free-tier ceiling: **1000 writes/day**.

Safe patterns:
- Run the brief + alert **once per day** (584 writes, leaves 416 headroom)
- Never poll `/signal` in a loop from a script that runs more than once/day
- The cron is your steady-state writer — everything else is occasional

## Diagnostic workflow

**1. Response body first.** `/sector/signal` returns `failed: [...]` — usually enough.

**2. `wrangler tail` only when the body doesn't explain.** Terminal 1, leave running. Trigger in Terminal 2. `Ctrl-C` only *after* the last curl returns.

**3. `curl` from your laptop is NOT a test.** Workers egress from Cloudflare IPs. Always test from the Worker.

## Diagnostic commands

    # Which sectors lack history?
    ./volatiai_brief.py --audit-history --no-color | head -30

    # What's firing right now?
    ./volatiai_brief.py --severity warn --no-color

    # Is the whole pipeline healthy?
    ./volatiai_brief.py --group kraken --no-color
