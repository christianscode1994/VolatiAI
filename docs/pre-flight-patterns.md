# Pre-flight decision matrix

## The two-test system

Both tests are necessary; neither is redundant.

- **Pre-flight** (from Mac, via curl) — filters the obvious dead endpoints before spending deploy cycles
- **Prod test** (from Cloudflare Worker) — the only authoritative check; CF egress IPs and fetch() semantics differ from curl on Mac

## Matrix

| Pre-flight (Mac) | Prod test (Worker) | Verdict | Action |
|---|---|---|---|
| 200 JSON | 200 JSON | Working sector | Ship |
| 4xx/000/HTML | — | Dead endpoint | Drop |
| 200 JSON | 403/429/525/530 | CF blocks Worker | Drop |
| **301/307/308** | — | **Unknown — retest with -L** | Test from Worker |
| **429** | — | **Transient** | Test from Worker at least once |
| 200 JSON | `no_<field>` | Shape mismatch | Fix field path |

## The 301 case (learning from Avoindata 2026-10)

`curl` without `-L` does not follow redirects; `fetch()` in Cloudflare Workers
follows redirects by default. So a 301 pre-flight is only checking curl's flag
defaults, not the endpoint's reachability.

Retest with `curl -sL`. If that returns 200 JSON → deploy as a single-sector
test batch, check `/raw`, commit only if `/raw` returns `{ok: true, data: <number>}`.

Example that shipped this way: `avoindata-fi-dataset-count` (301 → avoindata.suomi.fi, 2611 datasets).

## The 429 case

A 429 from Mac could be:
- Rate limit on the Mac's residential IP (transient, worker may pass)
- Real upstream throttle (worker will also hit it)

Test from Worker once before dropping. If it fails from Worker too — that's permanent, drop.
If it passes — keep, but expect intermittent 429s (unless the endpoint has generous per-IP limits and CF Workers rotate enough).

## Deploy batches for edge cases

For anything ambiguous (301, 429, single-block test): deploy as 1-sector batch,
prod-test, then promote or drop. Never combine ambiguous candidates with
confident ones in the same commit.
