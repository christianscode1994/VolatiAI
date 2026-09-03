# volatiai/src/dex_aave.py
from .dex_rpc import get_web3

AAVE_POOL_ABI = [
    {
        "name": "getReserveData",
        "inputs": [{"name": "asset", "type": "address"}],
        "outputs": [{"name": "configuration", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
]

def aave_get_reserve_data(pool_address: str, asset: str):
    w3 = get_web3()
    c = w3.eth.contract(
        address=w3.to_checksum_address(pool_address),
        abi=AAVE_POOL_ABI,
    )
    return c.functions.getReserveData(w3.to_checksum_address(asset)).call()
