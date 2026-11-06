import requests

def get_evm_nft_metadata(rpc_url: str, contract: str, token_id: int):
    # minimal ERC-721 tokenURI call via eth_call
    data = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_call",
        "params": [{
            "to": contract,
            "data": "0x95d89b41"  # placeholder; replace with tokenURI ABI-encoded
        }, "latest"]
    }
    r = requests.post(rpc_url, json=data, timeout=10)
    r.raise_for_status()
    return r.json()
