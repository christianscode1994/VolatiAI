# VolatiAI

Stateless, serverless signal aggregator. 443 sectors, 3 workers, 0 warnings.

## Commercial use

**Current status: NON-COMMERCIAL.** This is a personal/research project. No revenue, no ads,
no paid access. Signals may be published as aggregate facts.

If this changes to commercial use:
- **Must drop**: `musicbrainz-artist-count`, `who-life-expectancy` (CC BY-NC-SA — NC clause
  prohibits commercial use, including derivatives)
- **Must comply with**: Open Food Facts ODbL share-alike if any derived database is redistributed
- **Must assess**: ESPN, TheSportsDB, adsb.lol, Transitous, War-Tracker (no clear commercial ToS)

See `config/source_licenses.json` for per-sector license terms. `commercial_use: "no"` marks NC sources.

## Compliance posture

- **Stateless**: no user data, no accounts, no cookies, no tracking
- **No PII**: nothing to protect, nothing to erase
- **Cloudflare Workers**: inherits Cloudflare's SOC 2 / ISO 27001 / GDPR infrastructure certifications
- **License gate**: pre-commit audit blocks restricted sources; `SAFE_CC_BY_NC` and `SAFE_ODBL`
  are labeled honestly, not mislabeled as `SAFE_OPEN`

## Attribution

All derived signals cite their sources. See `public/attribution.json` (generated from
`config/source_licenses.json`). Attributions are displayed in the site footer.
