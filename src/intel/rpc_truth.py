import json
from pathlib import Path
import requests

RPCS = [
    "https://eth-mainnet.alchemyapi.io/v2/demo",
    "https://mainnet.infura.io/v3/demo"
]

def run():
    results = []
    for url in RPCS:
        try:
            r = requests.post(url, json={"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}, timeout=5)
            results.append(int(r.json()["result"], 16))
        except Exception:
            results.append(None)

    valid = [b for b in results if b is not None]
    truth_score = 0
    if len(valid) >= 2 and max(valid) - min(valid) < 5:
        truth_score = 100
    elif len(valid) >= 2:
        truth_score = 50

    Path("private/rpc_truth.json").write_text(json.dumps({
        "blocks": results,
        "truth_score": truth_score
    }, indent=2))

if __name__ == "__main__":
    run()
