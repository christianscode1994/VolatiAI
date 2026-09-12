import os
import random

SOLANA_RPCS = ["https://api.mainnet-beta.solana.com"]
ETH_RPCS = ["https://eth.llamarpc.com"]
DOT_RPCS = ["https://rpc.polkadot.io"]

def refresh_rpcs():
    os.environ["SOLANA_RPC"] = random.choice(SOLANA_RPCS)
    os.environ["ETH_RPC"] = random.choice(ETH_RPCS)
    os.environ["DOT_RPC"] = random.choice(DOT_RPCS)
