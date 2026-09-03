# volatiai/src/dex_uniswap_sushi.py
from .dex_rpc import get_web3

UNISWAP_V2_PAIR_ABI = [
    {
        "name": "getReserves",
        "outputs": [
            {"name": "reserve0", "type": "uint112"},
            {"name": "reserve1", "type": "uint112"},
            {"name": "blockTimestampLast", "type": "uint32"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
]

def fetch_v2_reserves(pair_address: str):
    w3 = get_web3()
    c = w3.eth.contract(
        address=w3.to_checksum_address(pair_address),
        abi=UNISWAP_V2_PAIR_ABI,
    )
    r0, r1, ts = c.functions.getReserves().call()
    return {"reserve0": r0, "reserve1": r1, "timestamp": ts}
