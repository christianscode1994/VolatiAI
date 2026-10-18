# Signal Envelope — all sector workers return this from GET /signal

{
  "sector": "blockchain",
  "has_signal": true,
  "density": "dense | slow | sparse | composite",
  "severity": "info | notice | alert | critical",
  "confidence": 0.85,
  "timestamp": "ISO8601 UTC",
  "summary": "max 120 chars, human readable",
  "delta": {
    "metric": "gas_price",
    "current": 45.2,
    "previous": 16.1,
    "pct_change": 180.7,
    "window": "1h | 24h | 7d | 1y"
  },
  "context": {},
  "sources": {"total": 15, "healthy": 5, "failed": []},
  "ttl_seconds": 300
}

Digest reads only: has_signal, density, severity, summary, timestamp.
Everything else is for debugging and future use.

Density patterns:
  dense     - numeric time-series, KV stores last 24, delta vs last check
  slow      - trend, KV stores last 12, delta vs 4 weeks ago
  sparse    - events, KV stores last event ID per source, new events trigger
  composite - dense OR sparse, combines into one summary

The digest groups by density, sorts by severity within group:
  dense     → "🔴 Dense signals (idag)"
  sparse    → "🟡 Events (senaste veckan)"
  slow      → "⚪ Slow trends (denna månad)"
  quiet     → counted in a single footer line, not listed
