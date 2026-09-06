from src.nft.solana.magiceden_collections import get_collection_stats
from src.nft.solana.magiceden_listings import get_listings
from src.nft.solana.magiceden_wallets import get_wallet_tokens
from src.nft.solana.magiceden_activity import get_activity
# EVM NFT modules you’ll add later:
# from src.nft.evm.metadata import get_evm_nft_metadata
# from src.nft.evm.transfers import get_evm_nft_transfers

def unified_nft(chain: str, identifier: str) -> dict:
    if chain == "solana":
        return {
            "stats": get_collection_stats(identifier),
            "listings": get_listings(identifier),
            "wallet": get_wallet_tokens(identifier),
            "activity": get_activity(identifier),
        }

    if chain in ("ethereum", "polygon", "base", "arbitrum", "optimism"):
        # placeholder for EVM NFT fusion
        return {
            "metadata": None,
            "transfers": None,
        }

    return {}
