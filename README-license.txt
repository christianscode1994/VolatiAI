VolatiAI Personal License
=========================

Thank you for your purchase.

Your signed license file will arrive by email within 24 hours.

How to verify your license offline:

1. Save the license file (license-<your-id>.json) to your machine.

2. Download the public key:
   https://christianscode1994.github.io/VolatiAI/.well-known/volatiai-license-pubkey.pem

3. Run the verifier:
   node scripts/license.cjs license-<your-id>.json volatiai-license-pubkey.pem

4. Expected output: "valid license" with your instance ID and issue date.

The license is a signed Ed25519 payload. It verifies against the public key
without any network call — no accounts, no phone-home, no server dependency.

If the license file does not arrive within 24 hours, or if verification fails,
reply to your Gumroad receipt email.

— VolatiAI
