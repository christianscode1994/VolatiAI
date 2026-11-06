import json
from pathlib import Path

import requests

RPCS = [
    "https://eth-mainnet.alchemyapi.io/v2/demo",
    "https://mainnet.infura.io/v3/demo"
]

REQUEST_TIMEOUT = 5
BLOCK_DRIFT_THRESHOLD = 5


def fetch_block_number(url):
    try:
        response = requests.post(
            url,
            json={
                "jsonrpc": "2.0",
                "method": "eth_blockNumber",
                "params": [],
                "id": 1
            },
            timeout=REQUEST_TIMEOUT
        )

        response.raise_for_status()

        data = response.json()

        result = data.get("result")
        if not result:
            return None

        return int(result, 16)

    except Exception:
        return None


def run():
    results = [fetch_block_number(url) for url in RPCS]

    valid = [block for block in results if block is not None]

    if len(valid) >= 2:
        drift = max(valid) - min(valid)

        if drift < BLOCK_DRIFT_THRESHOLD:
            truth_score = 100
        else:
            truth_score = 50
    else:
        drift = None
        truth_score = 0

    output = {
        "rpc_count": len(RPCS),
        "available_rpcs": len(valid),
        "blocks": results,
        "block_drift": drift,
        "truth_score": truth_score
    }

    Path("private/rpc_truth.json").write_text(
        json.dumps(output, indent=2),
        encoding="utf-8"
    )

    return output


if __name__ == "__main__":
    run()
