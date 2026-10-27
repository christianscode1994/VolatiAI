# Content and Template Approval Process

**Process date:** 2026-10-27
**Owner:** Solo developer/operator, VolatiAI
**Regulatory alignment:** FIN-FSA thematic review of crypto marketing (2025–2026)
**Jurisdiction:** Finland

## Purpose

FIN-FSA's thematic review of crypto-asset marketing found that firms often
lacked a documented approval process for marketing material and for the
social media channels used. VolatiAI is not a CASP and does not produce
marketing in the MiCA sense, but adopting a documented approval process for
its broadcast content is a proportionate and low-cost control that
reinforces the operator's compliance posture.

## Scope

This process covers:

- The digest templates used to generate broadcast content
- The sanitizer logic that shapes the output
- The list of channels the output is broadcast to
- The list of data sources that feed the output
- Any change to the above

## Approval workflow

Every change to broadcast content or channels follows this workflow:

1. **Proposal.** The operator writes down what is being changed and why,
   in a commit message or a short note in `compliance/CHANGELOG.md`.

2. **Checklist review.** Before merge/deploy, the operator confirms:

   - [ ] The change does not introduce personalization (per
         `no-personalization-policy.md`)
   - [ ] The change does not remove the AI Act disclosure footer (per
         `ai-act-transparency-assessment.md`)
   - [ ] The change does not remove the "Not Financial Advice" disclaimer
   - [ ] The change does not remove the attribution and terms links
   - [ ] Any new data source has a `source_licenses.json` entry with a
         `SAFE_*` category, and the pre-commit audit passes
   - [ ] Any new channel's rules on automation have been read and are
         satisfied
   - [ ] The change does not add any collection of user data

3. **Deploy.** The change is deployed and the operator records the deploy
   in `compliance/CHANGELOG.md`.

4. **Post-deploy check.** After 24 hours, the operator confirms the new
   content appears as intended on the target channels and does not trigger
   platform warnings.

## Data source approval

Adding a new data source follows an additional checklist:

- [ ] The source's license is identified and recorded
- [ ] The license category is assigned in `source_licenses.json`
- [ ] The source is keyless or key management is documented
- [ ] The source's terms of service have been read
- [ ] The source's rate limits are recorded
- [ ] The source's commercial-use status is recorded in `commercial_use`

## Channel approval

Adding a new broadcast channel follows an additional checklist:

- [ ] The channel's terms of service have been read
- [ ] The channel's rules on automated accounts have been read
- [ ] Any rate limits or posting caps have been recorded
- [ ] Any required bot labeling has been applied
- [ ] Any required prior approval from admins has been obtained

## Record keeping

- All content and template changes are recorded in git history with
  commit messages
- All channel and data source changes are recorded in
  `compliance/CHANGELOG.md`
- The current state of all data sources is inspectable via
  `config/source_licenses.json`

## Limitations

This process is the operator's own. It is not legal advice and does not
guarantee compliance with FIN-FSA expectations for authorized CASPs, which
VolatiAI is not.
