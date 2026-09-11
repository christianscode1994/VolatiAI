def detect_defi_shift(intel):
    score = intel["signals"]["defi"]
    return {
        "type": "defi_shift",
        "value": score,
        "shift": score > 0.75
    }
