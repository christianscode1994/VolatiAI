import json
import math
import logging
from statistics import mean

from .send_alert import send_alert

logger = logging.getLogger(__name__)

SCHEMA_VERSION = "2.0"

ALERT_THRESHOLD = 75


# ==========================================================
# Utilities
# ==========================================================

def clean_number(value, default=0.0):

    try:

        if value is None:
            return default

        value = float(value)

        if math.isnan(value):
            return default

        if math.isinf(value):
            return default

        return value

    except Exception:
        return default


def safe_mean(values):

    values = [
        clean_number(x)
        for x in values
    ]

    if not values:
        return 0.0

    return mean(values)


def safe_load_json(path):

    try:

        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    except FileNotFoundError:

        logger.warning(
            "Missing file: %s",
            path
        )

    except json.JSONDecodeError:

        logger.exception(
            "Invalid JSON: %s",
            path
        )

    except Exception:

        logger.exception(
            "Failed loading: %s",
            path
        )

    return {}


# ==========================================================
# Whale Normalization
# ==========================================================

def normalize_whale(item):

    try:

        # ["buy", 70]

        if isinstance(item, list):

            if len(item) >= 2:

                return {
                    "side": str(
                        item[0]
                    ).lower(),

                    "size": clean_number(
                        item[1]
                    ),

                    "exchange": "unknown"
                }

        # {"side":"buy","size":70}

        if isinstance(item, dict):

            side = (
                item.get("side")
                or item.get("direction")
                or item.get("type")
                or item.get("order_side")
            )

            size = (
                item.get("size")
                or item.get("amount")
                or item.get("volume")
                or item.get("btc")
                or item.get("quantity")
            )

            if side is None:
                return None

            if size is None:
                return None

            return {

                "side":
                    str(side).lower(),

                "size":
                    clean_number(size),

                "exchange":
                    item.get("exchange")
                    or item.get("venue")
                    or item.get("source")
                    or "unknown"
            }

    except Exception:

        logger.exception(
            "Failed whale normalization"
        )

    return None


# ==========================================================
# Severity
# ==========================================================

def get_severity(score):

    if score >= 90:
        return "CRITICAL"

    if score >= 75:
        return "HIGH"

    if score >= 60:
        return "MEDIUM"

    return "LOW"


# ==========================================================
# Main
# ==========================================================

def run():

    try:

        micro = safe_load_json(
            "private/microstructure.json"
        )

        whale_orders = micro.get(
            "whale_orders",
            []
        )

        bid_walls = micro.get(
            "bid_walls",
            []
        )

        ask_walls = micro.get(
            "ask_walls",
            []
        )

        funding_rates = micro.get(
            "funding_rates",
            {}
        )

        exchange_flows = micro.get(
            "exchange_flows",
            {}
        )

        stablecoin_flows = micro.get(
            "stablecoin_flows",
            {}
        )

        liquidations = micro.get(
            "liquidations",
            {}
        )

        # ==================================================
        # Normalize whales
        # ==================================================

        whales = []

        for item in whale_orders:

            normalized = normalize_whale(
                item
            )

            if normalized:
                whales.append(
                    normalized
                )

        buy_whales = [
            w for w in whales
            if w["side"] == "buy"
        ]

        sell_whales = [
            w for w in whales
            if w["side"] == "sell"
        ]

        buy_volume = sum(
            w["size"]
            for w in buy_whales
        )

        sell_volume = sum(
            w["size"]
            for w in sell_whales
        )

        whale_pressure = (
            buy_volume -
            sell_volume
        )

        largest_buy = max(
            (
                w["size"]
                for w in buy_whales
            ),
            default=0
        )

        largest_sell = max(
            (
                w["size"]
                for w in sell_whales
            ),
            default=0
        )

        largest_order = max(
            largest_buy,
            largest_sell
        )

        # ==================================================
        # Liquidity Walls
        # ==================================================

        bid_wall_volume = sum(
            clean_number(
                x.get("size", 0)
            )
            for x in bid_walls
            if isinstance(x, dict)
        )

        ask_wall_volume = sum(
            clean_number(
                x.get("size", 0)
            )
            for x in ask_walls
            if isinstance(x, dict)
        )

        wall_ratio = (
            bid_wall_volume /
            max(ask_wall_volume, 1)
        )

        wall_score = max(
            min(
                50 +
                (wall_ratio - 1) * 50,
                100
            ),
            0
        )

        # ==================================================
        # Funding
        # ==================================================

        funding_avg = safe_mean(
            funding_rates.values()
        )

        funding_divergence = 0

        if funding_rates:

            funding_values = [
                clean_number(v)
                for v in funding_rates.values()
            ]

            funding_divergence = (
                max(funding_values)
                -
                min(funding_values)
            )

        funding_score = max(
            min(
                50 -
                funding_avg * 1000,
                100
            ),
            0
        )

        # ==================================================
        # Stablecoins
        # ==================================================

        stablecoin_flow = sum(
            clean_number(v)
            for v in stablecoin_flows.values()
        )

        stablecoin_score = min(
            stablecoin_flow /
            10_000_000,
            100
        )

        # ==================================================
        # Exchange Flows
        # ==================================================

        exchange_net = sum(
            clean_number(v)
            for v in exchange_flows.values()
        )

        exchange_score = max(
            min(
                50 +
                exchange_net / 100,
                100
            ),
            0
        )

        # ==================================================
        # Liquidations
        # ==================================================

        long_liq = clean_number(
            liquidations.get(
                "long",
                0
            )
        )

        short_liq = clean_number(
            liquidations.get(
                "short",
                0
            )
        )

        liquidation_imbalance = (
            short_liq -
            long_liq
        )

        if short_liq > long_liq:
            liquidation_score = 70

        elif long_liq > short_liq:
            liquidation_score = 30

        else:
            liquidation_score = 50

        # ==================================================
        # Whale Scores
        # ==================================================

        pressure_score = max(
            min(
                50 +
                whale_pressure / 10,
                100
            ),
            0
        )

        whale_size_score = min(
            largest_order,
            100
        )

        # ==================================================
        # Smart Money
        # ==================================================

        smart_money_score = (

            pressure_score * 0.30 +

            whale_size_score * 0.25 +

            wall_score * 0.15 +

            stablecoin_score * 0.10 +

            exchange_score * 0.10 +

            funding_score * 0.05 +

            liquidation_score * 0.05
        )

        smart_money_score = round(
            clean_number(
                smart_money_score
            ),
            2
        )

        severity = get_severity(
            smart_money_score
        )

        trend = (
            "bullish"
            if whale_pressure > 0
            else "bearish"
        )

        # ==================================================
        # Alert
        # ==================================================

        if smart_money_score >= ALERT_THRESHOLD:

            send_alert(

                f"🐋 Smart Money Alert\n"

                f"Trend: {trend}\n"

                f"Severity: {severity}\n"

                f"Score: {smart_money_score}\n"

                f"Largest Order: {largest_order:.2f} BTC\n"

                f"Whale Pressure: {whale_pressure:.2f}\n"

                f"Wall Ratio: {wall_ratio:.2f}"
            )

        # ==================================================
        # Output
        # ==================================================

        return {

            "schema_version":
                SCHEMA_VERSION,

            "severity":
                severity,

            "trend":
                trend,

            "smart_money_score":
                smart_money_score,

            "confidence":
                min(
                    100,
                    int(
                        smart_money_score
                    )
                ),

            "buy_whales":
                len(buy_whales),

            "sell_whales":
                len(sell_whales),

            "largest_buy":
                largest_buy,

            "largest_sell":
                largest_sell,

            "largest_order":
                largest_order,

            "buy_volume":
                buy_volume,

            "sell_volume":
                sell_volume,

            "whale_pressure":
                whale_pressure,

            "bid_wall_volume":
                bid_wall_volume,

            "ask_wall_volume":
                ask_wall_volume,

            "wall_ratio":
                round(
                    wall_ratio,
                    4
                ),

            "funding_average":
                funding_avg,

            "funding_divergence":
                funding_divergence,

            "stablecoin_flow":
                stablecoin_flow,

            "exchange_net_flow":
                exchange_net,

            "long_liquidations":
                long_liq,

            "short_liquidations":
                short_liq,

            "liquidation_imbalance":
                liquidation_imbalance
        }

    except Exception as e:

        logger.exception(
            "whale_alerts failure"
        )

        return {

            "schema_version":
                SCHEMA_VERSION,

            "severity":
                "ERROR",

            "smart_money_score":
                0,

            "error":
                str(e)
        }
