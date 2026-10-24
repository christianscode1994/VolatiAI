#!/bin/bash
# priority_warm.sh — daily warm for the 60 sectors that matter
# Runs 04:00 local via launchd
# Total KV impact: ~30-40 writes/day (only when value changes)
set -u

PRIORITY=(
  # ─── Crypto spot (13) ───
  kraken-btc-usd
  kraken-eth-usd
  kraken-sol-usd
  kraken-xrp-usd
  kraken-ada-usd
  kraken-doge-usd
  kraken-dot-usd
  kraken-link-usd
  coinbase-btc-usd
  coinbase-eth-usd
  coinbase-btc-volume24h
  btc-exchange-spread
  eth-exchange-spread

  # ─── DeFi (7) ───
  stablecoin-total-supply
  stablecoin-usdt-supply
  stablecoin-usdc-supply
  dex-total-volume-24h
  dex-uniswap-volume
  dex-ethereum-volume
  defi-total-tvl

  # ─── Software ecosystem (4) ───
  ossf-scorecard-linux
  ecosyste-ms-react
  open-digger-openrank-vscode
  hackernews-top-scores

  # ─── Software security (5) ───
  osv-lodash-vuln-count
  cisa-kev-total
  epss-log4shell
  deps-dev-react-versions
  clearlydefined-react-license

  # ─── Software usage (3) ───
  pypi-downloads-requests
  npm-downloads-react
  librariesio-sourcerank-react

  # ─── News + environmental (6) ───
  hn-tech-sentiment
  spaceflight-news-count
  usgs-earthquake-count
  usgs-elevated-volcanoes
  uk-carbon-intensity
  pocketworld-space-weather

  # ─── Macro + FX (10) ───
  frankfurter-eurusd
  frankfurter-eursek
  fred-dgs10
  fred-fedfunds
  dbnomics-us-debt
  worldbank-us-unemployment
  worldbank-us-gdp
  worldbank-se-gdp
  nbp-gold-spot
  eurostat-eu-unemployment

  # ─── Cumulative counters (12) ───
  usgs-earthquakes
  usgs-earthquakes-emsc
  datacite-dois
  crossref-works
  total-cves
  total-leis
  total-bills
  total-works
  total-articles
  total-records
  total-triples
  total-artworks
)

BASE="https://sector-slow.fourieranalys.workers.dev"
ok=0
fail=0
failed_sectors=()
START_TS=$(date +%s)

for s in "${PRIORITY[@]}"; do
  if curl -sf --max-time 20 "$BASE/$s/signal" > /dev/null 2>&1; then
    ok=$((ok+1))
  else
    fail=$((fail+1))
    failed_sectors+=("$s")
  fi
  sleep 0.3
done

END_TS=$(date +%s)
DURATION=$((END_TS - START_TS))

# Log line
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) priority_warm: $ok ok, $fail failed, ${DURATION}s"

# Log failures specifically (so you can debug)
if [ $fail -gt 0 ]; then
  echo "  Failed: ${failed_sectors[*]}"
fi
