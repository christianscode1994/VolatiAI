import secrets

def generate_license(platform: str, user_id: str) -> str:
    rand = secrets.token_hex(4).upper()
    return f"VAI-LIC-{platform.upper()}-{user_id}-{rand}"
