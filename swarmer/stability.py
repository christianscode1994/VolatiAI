def stability_check(intel):
    # Avoid unstable periods
    if intel["signals"]["market"] > 0.95:
        return False

    if intel["signals"]["risk"] > 0.90:
        return False

    return True
