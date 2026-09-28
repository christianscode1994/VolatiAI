import time

from engine import generate_intel
from jobs.volatility_job import run_volatility_job
from jobs.sentiment_job import run_sentiment_job
from jobs.dev_activity_job import run_dev_activity_job
from jobs.exchange_depth_job import run_exchange_depth_job
from jobs.social_job import run_social_job
from jobs.anomaly_job import run_anomaly_job


def run_cycle():
    intel = generate_intel()
    print(f"[VolatiAI] Cycle at {intel['timestamp']} → {intel['signals']}")

    run_volatility_job(intel)
    run_sentiment_job(intel)
    run_dev_activity_job(intel)
    run_exchange_depth_job(intel)
    run_social_job(intel)
    run_anomaly_job(intel)


def scheduler(interval_seconds: int = 60):
    while True:
        run_cycle()
        time.sleep(interval_seconds)


if __name__ == "__main__":
    scheduler(60)
