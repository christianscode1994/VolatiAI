from src.tools_coingecko import CoinGecko
from src.tools_coinpaprika import CoinPaprika
from src.tools_kraken import Kraken
from src.tools_etherscan import Etherscan
from src.offline import snap, mode
import json

cg = CoinGecko()
cp = CoinPaprika()
kr = Kraken()
es = Etherscan()


def run():
    current_mode = mode.detect()

    if current_mode == "online":
        data = run_online()
        snap.set("last", data)
        snap.persist()
    else:
        data = run_offline()

    write_outputs(data)


def run_online():
    return {
        "global": {
            "coingecko": cg.global_market(),       # ✔ correct method name
            "coinpaprika": cp.global_market()      # ✔ correct method name
        },
        "btc": {
            "coingecko": cg.ticker("bitcoin"),
            "coinpaprika": cp.ticker("btc-bitcoin"),
            "kraken": kr.ticker("XBT/USD")
        },
        "onchain": {
            "etherscan": es.tx_summary()
        }
    }


def run_offline():
    return snap.get("last", {"global": {}, "btc": {}, "onchain": {}})


def write_outputs(data):
    with open("public/latest.json", "w") as f:
        json.dump(data, f, indent=2)


if __name__ == "__main__":
    run()
