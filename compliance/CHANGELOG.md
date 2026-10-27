# Compliance Changelog

Records of changes to VolatiAI's compliance posture, controls, and
documentation. Format follows the pattern of keep-a-changelog.

## 2026-10-27

### Added

- `compliance/` directory with operator assessments:
  - `ai-act-transparency-assessment.md` (Article 50)
  - `no-personalization-policy.md` (MiCA boundary)
  - `marketing-approval-process.md` (FIN-FSA aligned)
  - `no-personal-data-memo.md` (GDPR)
  - `CHANGELOG.md` (this file)

### Changed

- Sanitizer footer now includes "AI-generated content" disclosure
  alongside the bot label, satisfying Article 50(4) content disclosure
  explicitly (previously only the bot identity was disclosed)

### Verified

- Attribution URL live at `christianscode1994.github.io/VolatiAI/attribution.json`
- Privacy URL live at `christianscode1994.github.io/VolatiAI/privacy.html`
- Terms URL live at `christianscode1994.github.io/VolatiAI/terms.html`
- All 13 outbound senders (5 JS bots + 6 Python functions + 2 digest
  senders) route through the sanitizer
- `signalSectors: 151` SAFE from license map, `9/9` bad cases blocked
- 443 sectors fetched, 0 warnings
