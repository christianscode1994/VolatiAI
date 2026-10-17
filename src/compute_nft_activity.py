"""Aggregate NFT market activity across tracked collections."""

import logging
from collections import defaultdict

from src.config_signals import NFT_TRACKED
from src.nft.solana.magiceden_collections import get_collection_stats

logger = logging.getLogger("volatai.nft")


def _signal_for_avg(avg_floor: float, avg_change: float) -> str:
    if avg_change > 10:
        return "hot"
    if avg_change > 2:
        return "warming"
    if avg_change > -2:
        return "neutral"
    if avg_change > -10:
        return "cooling"
    return "cold"


def compute_nft_activity() -> dict:
    per_collection = []
    chain_split = defaultdict(int)

    for symbol, chain in NFT_TRACKED:
        try:
            stats = get_collection_stats(symbol)
            if not stats:
                per_collection.append({
                    "collection": symbol, "chain": chain, "error": "unreachable"
                })
                continue

            floor = stats.get("floorPrice") or 0
            volume_24h = stats.get("volume24hr") or 0
            listed = stats.get("listedCount") or 0
            avg_price = stats.get("avgPrice24hr") or 0

            per_collection.append({
                "collection": symbol,
                "chain": chain,
                "floor_sol": round(float(floor), 4),
                "volume_24h_sol": round(float(volume_24h), 2),
                "listed": int(listed),
                "avg_sale_sol": round(float(avg_price), 4),
            })
            chain_split[chain] += 1
        except Exception as e:
            logger.warning("nft %s failed: %s", symbol, e)
            per_collection.append({"collection": symbol, "chain": chain, "error": str(e)[:60]})

    active = [c for c in per_collection if "error" not in c]
    total_vol = sum(c.get("volume_24h_sol", 0) for c in active)
    avg_floor = sum(c.get("floor_sol", 0) for c in active) / len(active) if active else 0.0

    top = sorted(active, key=lambda x: x.get("volume_24h_sol", 0), reverse=True)[:5]

    return {
        "collections_tracked": len(per_collection),
        "collections_active": len(active),
        "volume_24h_total_sol": round(total_vol, 2),
        "avg_floor_sol": round(avg_floor, 4),
        "chain_split": dict(chain_split),
        "top_by_volume": top,
        "per_collection": per_collection,
        "signal": "active" if total_vol > 1000 else ("quiet" if total_vol > 100 else "dormant"),
    }
