#!/bin/bash
# Warm the priority sectors daily so their history accumulates.
# 18 sectors × 1 write/day × 30 days = 30 points of real history.
PRIORITY=(
  kraken-btc-usd kraken-eth-usd kraken-sol-usd
  coinbase-btc-usd coinbase-eth-usd coinbase-btc-volume24h
  btc-exchange-spread eth-exchange-spread
  frankfurter-eurusd frankfurter-eursek
  fred-dgs10 fred-fedfunds
  dbnomics-us-debt worldbank-us-unemployment
  worldbank-us-gdp worldbank-se-gdp
  nbp-gold-spot defillama-protocol-count
)
BASE="https://sector-slow.fourieranalys.workers.dev"
ok=0; fail=0
for s in "${PRIORITY[@]}"; do
  if curl -sf --max-time 20 "$BASE/$s/signal" > /dev/null; then
    ok=$((ok+1))
  else
    fail=$((fail+1))
  fi
  sleep 0.3
done
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) priority_warm: $ok ok, $fail failed"
