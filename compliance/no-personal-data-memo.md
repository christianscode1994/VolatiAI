# No-Personal-Data Processing Memo

**Memo date:** 2026-10-27
**Owner:** Solo developer/operator, VolatiAI
**Regulatory context:** GDPR (Regulation (EU) 2016/679)
**Supervisory authority:** Finnish Data Protection Ombudsman
**Jurisdiction:** Finland

## Purpose

This memo documents VolatiAI's data flows and the operator's assessment
that VolatiAI does not process personal data within the meaning of
Article 4(1) GDPR, and therefore that the core obligations of the GDPR
do not apply to the system.

## What VolatiAI does

VolatiAI:

1. Fetches data from public APIs (NASA, USGS, WHO, Open-Meteo, etc.)
2. Synthesizes aggregated signals from that data
3. Broadcasts the same signal to all followers on public channels
4. Serves static pages (privacy.html, terms.html, attribution.json)

## What VolatiAI does not do

VolatiAI does not:

- Create, accept, or store user accounts
- Accept or store any identifying information from any user
- Set cookies or tracking identifiers
- Store IP addresses in its own systems
- Accept payments or billing information
- Provide personalized output
- Maintain profiles of any user
- Run analytics that produce individual-level records

## Data flows

| Flow | Data | Retained by VolatiAI? | Retention |
|---|---|---|---|
| Public data fetch | Public API responses | No (used to compute, not stored) | — |
| Broadcast | Signal text | No (posted to platform, not stored) | — |
| Static page serving | HTTP request to Cloudflare | No (Cloudflare logs per its policy) | — |

## Third parties

VolatiAI is hosted on Cloudflare. Cloudflare processes technical data
(including IP addresses) as part of hosting per its own privacy policy.
VolatiAI does not access, receive, or store that data.

## Conclusion

VolatiAI does not process personal data in its own systems. The core
obligations of the GDPR (lawful basis, data subject rights, retention,
breach notification, DPO appointment, records of processing) do not apply
to VolatiAI as a data controller for user data, because VolatiAI is not a
controller for any user data.

VolatiAI is not a data processor for any third party either, because it
does not process any data on behalf of any other party.

## Conditions under which this memo would require revision

This memo must be re-assessed if VolatiAI:

- Adds user accounts
- Adds cookies or tracking
- Accepts payments
- Adds any personalization based on user identity
- Deploys any new feature that collects, stores, or derives information
  about identifiable individuals

Any of the above is treated as a scope change requiring a new assessment.

## Privacy page

The privacy page at `public/privacy.html` (served at
`christianscode1994.github.io/VolatiAI/privacy.html`) reflects the
conclusion of this memo for users of the service.

## Limitations

This is the operator's own assessment. It reflects the operator's reading
of the GDPR as of the memo date. A qualified legal professional should be
consulted before any change that could make this assessment inaccurate.
