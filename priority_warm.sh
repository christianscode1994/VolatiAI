#!/bin/bash
# priority_warm.sh — auto-generated from seed_history.sh winners
# Regenerated: $(date -u +%Y-%m-%dT%H:%M:%SZ) — DO NOT edit manually
set -u

PRIORITY=(
  # ─── Crypto (13) ───
  kraken-btc-usd
  coinbase-btc-usd
  kraken-sol-usd
  coinbase-btc-volume24h
  kraken-eth-usd
  coinbase-eth-usd
  btc-exchange-spread
  eth-exchange-spread
  kraken-xrp-usd
  kraken-ada-usd
  kraken-doge-usd
  kraken-dot-usd
  kraken-link-usd

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

  # ─── Software security (6) ───
  cisa-kev-count
  osv-lodash-vuln-count
  cisa-kev-total
  epss-log4shell
  deps-dev-react-versions
  clearlydefined-react-license

  # ─── Software usage (3) ───
  pypi-downloads-requests
  npm-downloads-react
  librariesio-sourcerank-react

  # ─── News + science (9) ───
  usgs-earthquakes
  usgs-earthquakes-emsc
  hn-tech-sentiment
  spaceflight-news-count
  usgs-earthquake-count
  eurostat-eu-unemployment
  usgs-elevated-volcanoes
  pocketworld-space-weather

  # ─── FX + Macro (9) ───
  frankfurter-eurusd
  frankfurter-eursek
  nbp-gold-spot
  dbnomics-us-debt
  worldbank-us-unemployment
  worldbank-us-gdp
  worldbank-se-gdp
  fred-dgs10
  fred-fedfunds

  # ─── Cumulative counters (92) ───
  environment
  gdp
  treasuries
  unemployment
  rir-arin
  ripe-atlas-public
  ripestat
  ietf-datatracker
  arbetsformedlingen
  poligraph
  mattercatalog
  home-assistant
  robonix
  saos
  dc-crime
  met-artworks
  cern-opendata
  tweetfeed-c2
  wikidata-triples
  ballotwatch-bills
  openfda-drug-recalls
  openfda-food-recalls
  openfda-device-recalls
  cleveland-artworks
  apis-guru-directory
  noaa-spaceweather-alerts
  crossref-works
  doaj-articles
  datacite-dois
  zenodo-records
  treasuries-gov
  nvd-cve-count
  phishunt-domains
  gleif-leis
  defillama-protocol-count

  # ─── New cybersecurity & developer activity ───
  feodo-c2-count
  nvd-new-cves-count
  github-recent-commits
  pypi-daily-requests
  # ─── Event sectors (1) ───
  drug-approvals
  # ─── Data center infra ───
  geocables-incidents
  # ─── Auctions & e-commerce ───
  whiskyhunter-lot-count
  shopify-allbirds-product-count
  cheapshark-deal-count
  # ─── Sports/weather/gaming ───
  espn-nfl-score-count
  espn-nba-score-count
  open-meteo-berlin-temp
  steam-csgo-players
  steam-dota2-players
  # ─── Dense keyless (verified 2026-10-25) ───
  open-meteo-pm25
  usgs-significant-quakes
  open-notify-astronauts
  # ─── Streaming/video (2026-10-25) ───
  tvmaze-us-schedule-count
  dailymotion-video-views
  iptv-org-channel-count
  # ─── Dense/fast batch 2 (2026-10-25) ───
  whitebit-btc-usdt
  usgs-significant-hour
  # ─── Group 1 verified (2026-10-25) ───
  frankfurter-eur-usd
  openlibrary-ml-books
  npm-scraper-packages
  sunrise-berlin-daylength
  crossref-deep-learning
  pubmed-covid-papers
  pypistats-fastapi-downloads
  openverse-cat-images
  zippopotam-10001-places
  7timer-berlin-temp
  pypi-requests-releases
  randomuser-heartbeat
  coinmarketcap-btc-usd
  allratestoday-usd-eur
  shodan-google-dns-ports
  wikipedia-bitcoin-extract-len
  wttr-dhaka-temp
  # ─── Genomics/wellness (2026-10-25) ───
  ensembl-brca1-gene
  mygene-brca1-hits
  myvariant-rs113488022-hits
  europepmc-crispr-therapy
  open-mindfulness-resource-count
  affirmations-length
  cdc-covid-total-deaths
  who-gho-indicator-count
  viruswatch-disease-count
  pubmed-acupuncture-papers
  pubmed-meditation-papers
  # ─── Tech (2026-10-25) ───
  langpop-python-composite-score
  dcentral-miner-count
  # ─── Gov/energy/health (2026-10-25) ───
  uk-carbon-intensity-now
  corona-zahlen-germany-week-incidence
  gbif-homo-sapiens-key
  clinicaltrials-total-studies
  south-tyrol-accommodations
  fdic-insured-banks
  circle-x402-resources
  nyfed-sofr-rate
  bts-us-canada-truck-crossings
  bts-containership-capacity
  eurostat-inland-waterway-freight
  gdacs-active-disasters
  geonet-nz-felt-quakes
  idigbio-total-specimens
  nhm-london-dataset-count
  obis-marine-occurrences
  gleif-total-leis
  sec-aapl-filings-30d
  prh-finland-total-companies
  noaa-swpc-kp-index
  bfs-swiss-dataset-count
  avoindata-fi-dataset-count
  datafirst-african-surveys
  first-org-csirt-teams
  geonet-nz-volcanic-alerts
  dexpaprika-total-dex-volume
  shipwreckatlas-total-wrecks
  miso-grid-total-load
  nws-active-severe-alerts
)

BASE="https://sector-slow.fourieranalys.workers.dev"
ok=0
fail=0
failed_sectors=()
START_TS=$(date +%s)

for s in "${PRIORITY[@]}"; do
  if curl -sf --max-time 15 "$BASE/$s/signal" > /dev/null 2>&1; then
    ok=$((ok+1))
  else
    fail=$((fail+1))
    failed_sectors+=("$s")
  fi
  sleep 0.2
done

END_TS=$(date +%s)
DURATION=$((END_TS - START_TS))

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) priority_warm: $ok ok, $fail failed, ${DURATION}s"
if [ $fail -gt 0 ]; then
  echo "  Failed: ${failed_sectors[*]}"
fi