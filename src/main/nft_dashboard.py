# src/main/nft_dashboard.py

from src.fusion.nft_unified import unified_nft
from src.fusion.nft_score import score_nft
from src.fusion.nft_volatility import nft_volatility

def nft_dashboard(chain: str, identifier: str) -> dict:
    base = unified_nft(chain, identifier)
    score = score_nft(chain, identifier)
    vol = nft_volatility(chain, identifier)

    return {
        "chain": chain,
        "identifier": identifier,
        "market": base,
        "score": score,
        "volatility": vol,
    }
