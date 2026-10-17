"""Magic Eden API client (keyless public endpoints)."""

import time
import logging
from typing import Optional

import requests

BASE = "https://api-mainnet.magiceden.dev/v2"
logger = logging.getLogger("volatai.magiceden")


def me_get(path: str, params: Optional[dict] = None, retries: int = 3) -> dict:
    url = f"{BASE}/{path.lstrip('/')}"
    for attempt in range(retries):
        try:
            r = requests.get(
                url,
                params=params or {},
                timeout=15,
                headers={"User-Agent": "VolatiAI/1.0", "Accept": "application/json"},
            )
            if r.status_code == 429:
                time.sleep(2 ** attempt)
                continue
            if r.status_code == 404:
                return {}
            r.raise_for_status()
            return r.json()
        except requests.RequestException as e:
            if attempt == retries - 1:
                logger.warning("Magic Eden %s failed: %s", path, e)
                return {}
            time.sleep(1.5 * (attempt + 1))
    return {}
