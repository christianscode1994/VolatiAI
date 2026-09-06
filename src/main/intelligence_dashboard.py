from src.intelligence.nft_score import nft_score
from src.intelligence.nft_volatility import nft_volatility
from src.intelligence.token_score import token_score
from src.intelligence.chain_score import chain_score
from src.intelligence.market_score import market_score

def intelligence_dashboard(chain: str, identifier: str, asset: str) -> dict:
    return {
        "nft": {
            "score": nft_score(chain, identifier),
            "volatility": nft_volatility(chain, identifier),
        },
        "token": token_score(chain, asset),
        "chain": chain_score(chain),
        "market": market_score(asset),
    }
