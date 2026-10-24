#!/usr/bin/env bash
set -u
ok=0; fail=0
check() {
  local name="$1" url="$2"
  if curl -sf --max-time 12 -A "${VOLATIAI_UA:-VolatiAI/1.0}" "$url" >/dev/null; then
    printf '  PASS  %s\n' "$name"; ok=$((ok+1))
  else
    printf '  FAIL  %s\n' "$name"; fail=$((fail+1))
  fi
}
check frankfurter   "https://api.frankfurter.dev/v1/currencies"
check er-api        "https://open.er-api.com/v6/latest/USD"
check nbp-rates     "https://api.nbp.pl/api/exchangerates/tables/A?format=json"
check nbp-gold      "https://api.nbp.pl/api/cenyzlota/?format=json"
check yahoo         "https://query1.finance.yahoo.com/v8/finance/chart/AAPL"
check coingecko     "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
check coinlore      "https://api.coinlore.net/api/tickers/"
check coinbase      "https://api.exchange.coinbase.com/products/BTC-USD/ticker"
check kraken        "https://api.kraken.com/0/public/Ticker?pair=XBTUSD"
check dexscreener   "https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112"
check defillama     "https://api.llama.fi/protocols"
check worldbank     "https://api.worldbank.org/v2/country/US/indicator/NY.GDP.MKTP.CD?format=json&per_page=1"
check treasury      "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?page%5Bsize%5D=1"
check bls           "https://api.bls.gov/publicAPI/v1/timeseries/data/LNS14000000"
check sec-edgar     "https://data.sec.gov/submissions/CIK0000320193.json"
printf '\n%d ok, %d fail\n' "$ok" "$fail"
