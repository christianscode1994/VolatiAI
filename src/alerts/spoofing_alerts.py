# src/alerts/spoofing_alerts.py

import json
import math
import logging

from .send_alert import send_alert

logger = logging.getLogger(__name__)

SCHEMA_VERSION = "2.0"

ALERT_THRESHOLD = 70


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


def safe_load_json(path):

    try:

        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    except FileNotFoundError:

        logger.warning(
            "File not found: %s",
            path
        )

    except json.JSONDecodeError:

        logger.exception(
            "Invalid JSON: %s",
            path
        )

    except Exception:

        logger.exception(
            "Failed loading %s",
            path
        )

    return {}


def severity_from_score(score):

    if score >= 90:
        return "CRITICAL"

    if score >= 80:
        return "HIGH"

    if score >= 70:
        return "MEDIUM"

    return "LOW"


def classify(score):

    if score >= 75:
        return "likely"

    if score >= 50:
        return "possible"

    return "unlikely"


def run():

    try:

        micro = safe_load_json(
            "private/microstructure.json"
        )

        spoofing_score = clean_number(
            micro.get(
                "spoofing_score",
                0
            )
        )

        spoofing_events = clean_number(
            micro.get(
                "spoofing_events",
                0
            )
        )

        suspicious_orders = clean_number(
            micro.get(
                "suspicious_orders",
                0
            )
        )

        cancelled_large_orders = clean_number(
            micro.get(
                "cancelled_large_orders",
                0
            )
        )

        severity = severity_from_score(
            spoofing_score
        )

        classification = classify(
            spoofing_score
        )

        if spoofing_score >= ALERT_THRESHOLD:

            send_alert(

                f"⚠️ Spoofing Warning\n"

                f"Severity: {severity}\n"

                f"Probability: "
                f"{spoofing_score:.1f}%\n"

                f"Classification: "
                f"{classification}"
            )

        return {

            "schema_version":
                SCHEMA_VERSION,

            "severity":
                severity,

            "classification":
                classification,

            "spoofing_score":
                spoofing_score,

            "spoofing_events":
                int(spoofing_events),

            "suspicious_orders":
                int(suspicious_orders),

            "cancelled_large_orders":
                int(cancelled_large_orders),

            "alert_triggered":
                spoofing_score >= ALERT_THRESHOLD
        }

    except Exception as e:

        logger.exception(
            "spoofing_alerts failure"
        )

        return {

            "schema_version":
                SCHEMA_VERSION,

            "severity":
                "ERROR",

            "spoofing_score":
                0,

            "error":
                str(e)
        }
