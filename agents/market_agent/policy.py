from tools_coingecko import CoinGecko
from tools_coinpaprika import CoinPaprika
from tools_kraken import Kraken
from tools_etherscan import Etherscan
from offline import snap, mode
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
            "coingecko": cg.global_market(),
            "coinpaprika": cp.global_market()
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
    free = {
        "global": data["global"],
        "btc": data["btc"]
    }
    pro = data

    with open("public/free_market.json", "w") as f:
        json.dump(free, f, indent=2)
    with open("private/pro_market.json", "w") as f:
        json.dump(pro, f, indent=2)

if __name__ == "__main__":
    run()
