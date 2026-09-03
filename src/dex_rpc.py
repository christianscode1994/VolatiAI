# volatiai/src/dex_rpc.py
import os
from web3 import Web3

INFURA_URL = os.getenv("INFURA_URL")
ALCHEMY_URL = os.getenv("ALCHEMY_URL")
PUBLIC_RPC = "https://ethereum.publicnode.com"

RPC_PROVIDERS = [p for p in [ALCHEMY_URL, INFURA_URL, PUBLIC_RPC] if p]

def get_web3():
    last_err = None
    for url in RPC_PROVIDERS:
        try:
            w3 = Web3(Web3.HTTPProvider(url, request_kwargs={"timeout": 10}))
            if w3.is_connected():
                return w3
        except Exception as e:
            last_err = e
    raise RuntimeError(f"All RPC providers failed: {last_err}")
