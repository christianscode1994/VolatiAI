#!/bin/bash
# Backfill 30 days of history for sectors with native historical APIs
set -u
BASE="https://sector-slow.fourieranalys.workers.dev"
NS="5a2afb46033e49dc8d2ddefac347ddb5"

# Crypto pairs (Kraken OHLC daily)
for pair in XBTUSD ETHUSD SOLUSD XRPUSD ADAUSD DOGEUSD DOTUSD LINKUSD; do
  sector="kraken-$(echo $pair | sed 's/USD//;s/XBT/BTC/' | tr '[:upper:]' '[:lower:]')-usd"
  echo "Backfilling $sector from Kraken OHLC..."
  curl -s "https://api.kraken.com/0/public/OHLC?pair=$pair&interval=1440" \
    | jq -r '.result[keys[] | select(. != "last")] | .[-30:] | map({t: (.[0]*1000|todate), v: (.[4]|tonumber)}) | tostring' \
    > /tmp/hist.json
  cd workers/sector-slow
  npx wrangler kv key put --namespace-id "$NS" --remote "${sector}_$(echo $pair | sed 's/USD/_usd/;s/XBT/btc/' | tr '[:upper:]' '[:lower:]')_history" --path /tmp/hist.json 2>&1 | tail -1
  cd ../..
done
