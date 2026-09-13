# Licensing Architecture (VAI-LIC)

## Purpose
Provide a unified, platform-agnostic license key format for VolatiAI that works
across Gumroad, Paddle, Lemon Squeezy, and Stripe. This is an internal access
mechanism, not a crypto token or financial asset.

## License Format
VAI-LIC-{PLATFORM}-{USERID}-{RANDOMHEX}

Examples:
- VAI-LIC-GUMROAD-9281-AB12F9C3
- VAI-LIC-PADDLE-5510-9FEE12A1
- VAI-LIC-LEMON-7722-CC88D1F0
- VAI-LIC-STRIPE-0012-FA9912D3

## Components
- license_key.py: generates VAI-LIC keys after successful purchase.
- license_validator.py: parses and validates keys.
- platforms/*: platform-specific validation logic.

## Flow
1. User purchases via Gumroad/Paddle/Lemon/Stripe.
2. Platform webhook confirms purchase.
3. Backend generates VAI-LIC key and stores it.
4. User provides VAI-LIC to VolatiAI.
5. VolatiAI validates key via platform-specific logic.
6. On success, access is granted.

## Safety
- Not a crypto token.
- Not tradable or redeemable.
- No user balances.
- Purely an internal access key.
