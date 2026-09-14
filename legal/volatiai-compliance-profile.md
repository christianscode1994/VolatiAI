# VolatiAI Compliance Profile
### Serverless, Stateless, Zero‑Data Architecture

VolatiAI is a serverless AI/DePIN intelligence engine designed to operate without storing, processing, or collecting personal data. Its architecture is intentionally built to avoid regulatory obligations such as GDPR, NIS2, PCI-DSS, AML/KYC, or financial compliance frameworks.

---

## 1. Data Classification
VolatiAI processes **only public, non-personal, non-sensitive data**, including:
- Market volatility metrics
- Exchange depth snapshots
- Developer activity (NPM, Cargo, Solana, Polkadot, EVM)
- Public sentiment signals (Reddit, Hacker News)
- On-chain analytics
- Public DePIN metrics

VolatiAI does **not** process:
- Personal data
- User accounts
- IP addresses
- Cookies
- Device identifiers
- Payment information
- Authentication tokens
- Private messages
- Customer records

---

## 2. Processing Model
VolatiAI uses **ephemeral GitHub Actions runners**:
- No persistent servers
- No databases
- No long-term storage
- No user-specific state
- No tracking or telemetry

All computation is stateless and destroyed after execution.

---

## 3. Legal Roles
VolatiAI is:
- **Not a Data Controller**
- **Not a Data Processor**
- **Not a Financial Service**
- **Not a Custodian**
- **Not a Broker**
- **Not a Payment Provider**

VolatiAI is strictly an **analytics engine** operating on public data.

---

## 4. Compliance Impact
Because VolatiAI does not process personal data, GDPR does not apply.

Because VolatiAI does not provide financial services, AML/KYC does not apply.

Because VolatiAI does not operate infrastructure, NIS2 does not apply.

---

## 5. Summary
VolatiAI is intentionally designed to be:
- Serverless  
- Stateless  
- Zero‑data  
- Zero‑compliance  
- Zero‑risk  

This profile confirms that VolatiAI’s architecture avoids regulatory obligations by design.
