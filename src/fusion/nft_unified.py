from src.nft.solana.magiceden_collections import get_collection_stats
from src.nft.solana.magiceden_listings import get_listings
from src.nft.solana.magiceden_wallets import get_wallet_tokens
from src.nft.solana.magiceden_activity import get_activity

def unified_nft(chain, identifier):
    if chain == "solana":
        return {
            "stats": get_collection_stats(identifier),
            "listings": get_listings(identifier),
            "wallet": get_wallet_tokens(identifier),
            "activity": get_activity(identifier)
        }

    # EVM → handled by Alchemy + Infura RPC
