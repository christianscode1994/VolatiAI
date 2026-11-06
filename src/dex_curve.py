# volatiai/src/dex_curve.py
from .dex_rpc import get_web3

CURVE_POOL_ABI = [
    {
        "name": "get_dy",
        "inputs": [
            {"name": "i", "type": "int128"},
            {"name": "j", "type": "int128"},
            {"name": "dx", "type": "uint256"},
        ],
        "outputs": [{"name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
]

def curve_get_dy(pool_address: str, i: int, j: int, dx: int):
    w3 = get_web3()
    c = w3.eth.contract(
        address=w3.to_checksum_address(pool_address),
        abi=CURVE_POOL_ABI,
    )
    return c.functions.get_dy(i, j, dx).call()
