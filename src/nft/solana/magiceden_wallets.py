from .magiceden import me_get

def get_wallet_tokens(address):
    return me_get(f"wallets/{address}/tokens")
