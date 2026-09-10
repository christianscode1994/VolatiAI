import time
from core.uio import build_uio

def snapshot_intel():
    """
    Single source of truth for all bots.
    """
    uio = build_uio()
    ts = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())

    master = uio["master"]
    score = master["fused_score"]
    label = master["label"]

    return {
        "timestamp": ts,
        "score": score,
        "label": label,
        "uio": uio,
    }
