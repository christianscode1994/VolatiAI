# core/api/auth.py

from core.licensing.license_validator import validate_license

class AuthResult:
    def __init__(self, ok: bool, reason: str | None = None):
        self.ok = ok
        self.reason = reason

def authenticate_request(license_key: str | None) -> AuthResult:
    """
    Authentication for VolatiAI API.

    - If license_key is present and valid -> ok = True
    - If license_key is missing or invalid -> ok = False

    This does NOT implement tiers, plans, or selling access.
    It is purely a gate: "is this key recognized?".
    """

    if not license_key:
        return AuthResult(ok=False, reason="missing_license_key")

    if not validate_license(license_key):
        return AuthResult(ok=False, reason="invalid_license_key")

    return AuthResult(ok=True)
