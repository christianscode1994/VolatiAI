from datetime import datetime
from history import read_snapshots
from metrics import (
    METRICS,
    aggregate_metric,
    volatai_score,
    detect_alerts,
)

from defi_scoring import score_defi
from compute_defi_alerts import compute_defi_alerts


# ---------- Helpers ----------
def _arrow(current, prev):
    if prev is None:
        return "→"
    if current > prev:
        return "↑"
    if current < prev:
        return "↓"
    return "→"


def _color(text, level):
    if level == "good":
        return f"\033[92m{text}\033[0m"
    if level == "warn":
        return f"\033[93m{text}\033[0m"
    if level == "bad":
        return f"\033[91m{text}\033[0m"
    return text


def _sparkline(values):
    if not values:
        return ""
    blocks = "▁▂▃▄▅▆▇█"
    mn, mx = min(values), max(values)
    if mx == mn:
        return "▁" * len(values)
    return "".join(blocks[int((v - mn) / (mx - mn) * (len(blocks) - 1))] for v in values)


# ---------- Dashboard Builder ----------
def build_dashboard(days: int = 7) -> dict:
    dashboard = {
        "window_days": days,
        "generated_at": datetime.utcnow().isoformat(),
        "metrics": {},
        "defi": {},
        "composite_score": None,
        "alerts": [],
    }

    aggregated = {}
    for metric in METRICS:
        snaps = read_snapshots(metric, days)
        aggregated[metric] = aggregate_metric(metric, snaps)
        dashboard["metrics"][metric] = aggregated[metric]

    # DeFi snapshots
    defi_snaps = read_snapshots("defi_health", days)
    if defi_snaps:
        latest = defi_snaps[-1]
        prev = defi_snaps[-2] if len(defi_snaps) > 1 else None

        defi_score = score_defi(
            latest.get("uniswap_liquidity", 0),
            latest.get("sushiswap_liquidity", 0),
            latest.get("curve_stability", 0),
            latest.get("aave_utilization", 0),
            latest.get("dai_peg_deviation", 0),
        )

        dashboard["defi"] = {
            "raw": latest,
            "prev": prev,
            "score": defi_score,
            "alerts": compute_defi_alerts(latest),
            "history": defi_snaps,
        }

    dashboard["composite_score"] = volatai_score(aggregated)

    dashboard["alerts"] = detect_alerts(aggregated)
    if dashboard["defi"]:
        dashboard["alerts"].extend(dashboard["defi"]["alerts"])

    return dashboard


# ---------- CLI Dashboard ----------
def print_dashboard(days: int = 7) -> None:
    d = build_dashboard(days)

    print("=== VolatiAI Dashboard ===")
    print(f"Window: last {d['window_days']} days")
    print(f"Generated at: {d['generated_at']}")
    print()
    print(f"Composite VolatiAI Score: {d['composite_score']:.4f}")
    print()

    # Market metrics
    for metric, info in d["metrics"].items():
        print(f"[{metric}]")
        print(f"  count = {info['count']}")
        print(f"  mean  = {info['mean']}")
        print(f"  min   = {info['min']}")
        print(f"  max   = {info['max']}")
        print()

    # DeFi section
    if d["defi"]:
        defi = d["defi"]
        raw = defi["raw"]
        prev = defi["prev"]

        score_level = (
            "good" if defi["score"] >= 0.7
            else "warn" if defi["score"] >= 0.4
            else "bad"
        )

        print("=== DeFi Health ===")
        print(_color(f"Score: {defi['score']:.4f}", score_level))

        # Liquidity + trend arrows
        ul = raw.get("uniswap_liquidity", 0)
        ul_prev = prev.get("uniswap_liquidity", 0) if prev else None
        print(f"Uniswap liquidity: {ul:.2f} {_arrow(ul, ul_prev)}")

        sl = raw.get("sushiswap_liquidity", 0)
        sl_prev = prev.get("sushiswap_liquidity", 0) if prev else None
        print(f"SushiSwap liquidity: {sl:.2f} {_arrow(sl, sl_prev)}")

        cs = raw.get("curve_stability", 0)
        cs_prev = prev.get("curve_stability", 0) if prev else None
        print(f"Curve stability: {cs:.2f} {_arrow(cs, cs_prev)}")

        au = raw.get("aave_utilization", 0)
        au_prev = prev.get("aave_utilization", 0) if prev else None
        print(f"Aave utilization: {au:.2%} {_arrow(au, au_prev)}")

        dp = raw.get("dai_peg_deviation", 0)
        dp_prev = prev.get("dai_peg_deviation", 0) if prev else None
        print(f"DAI peg deviation: {dp:.4f} {_arrow(dp, dp_prev)}")

        # Sparkline history
        print("\nDeFi score trend:")
        history_scores = [
            score_defi(
                snap.get("uniswap_liquidity", 0),
                snap.get("sushiswap_liquidity", 0),
                snap.get("curve_stability", 0),
                snap.get("aave_utilization", 0),
                snap.get("dai_peg_deviation", 0),
            )
            for snap in defi["history"]
        ]
        print(" ", _sparkline(history_scores))
        print()

    # Alerts
    if d["alerts"]:
        print("Alerts:")
        for alert in d["alerts"]:
            print(f" - {alert}")
    else:
        print("No alerts detected.")
