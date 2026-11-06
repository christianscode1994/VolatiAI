# API Authentication Architecture

## Purpose
Provide a minimal authentication layer for VolatiAI that checks a license key
without implementing commercial tiers, plans, or selling access in the SaaS
sense.

The goal is:
- "Is this key recognized?"
- "Has this instance been activated?"
Not:
- "What plan is this user on?"
- "What features should be gated?"

## Inputs
- license_key (string, optional)

## Core Logic
1. If license_key is missing:
   - Authentication fails with reason "missing_license_key".
2. If license_key is present but invalid:
   - Authentication fails with reason "invalid_license_key".
3. If license_key is valid:
   - Authentication succeeds.

## Integration with Licensing
API auth uses:
- license_validator.validate_license(key)

Licensing itself:
- Does not represent a financial token.
- Does not implement tiers.
- Does not manage user balances.
- Does not sell access in the SaaS sense.

It is simply:
- A way to confirm that this VolatiAI instance has been activated via a
  recognized key.

## Usage
Serverless handlers:
- Call authenticate_request(license_key).
- If ok == False, return an error.
- If ok == True, proceed with mission execution.

## Safety
- No subscription logic.
- No pricing logic.
- No plan or tier logic.
- No tokenomics.
- Purely an activation check for a personal or licensed instance.
