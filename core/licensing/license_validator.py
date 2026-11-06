def validate_license(key: str) -> bool:
    parts = key.split("-")
    if len(parts) != 5:
        return False

    _, _, platform, user_id, rand = parts

    # platform-specific validation
    if platform == "GUMROAD":
        return validate_gumroad(user_id, rand)
    if platform == "PADDLE":
        return validate_paddle(user_id, rand)
    if platform == "LEMON":
        return validate_lemon(user_id, rand)
    if platform == "STRIPE":
        return validate_stripe(user_id, rand)

    return False
