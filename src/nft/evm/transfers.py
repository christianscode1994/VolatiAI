import requests

def get_evm_nft_transfers(rpc_url: str, contract: str, from_block: str = "0x0"):
    data = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_getLogs",
        "params": [{
            "fromBlock": from_block,
            "toBlock": "latest",
            "address": contract,
            "topics": [
                "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
            ]
        }]
    }
    r = requests.post(rpc_url, json=data, timeout=10)
    r.raise_for_status()
    return r.json().get("result", [])
