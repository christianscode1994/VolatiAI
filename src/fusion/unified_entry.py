from src.fusion.nft_unified import unified_nft
from src.fusion.token_unified import unified_token
from src.fusion.chain_unified import unified_chain
from src.fusion.market_unified import unified_market

def unified_view(kind: str, **kwargs) -> dict:
    if kind == "nft":
        return unified_nft(kwargs["chain"], kwargs["identifier"])
    if kind == "token":
        return unified_token(kwargs["chain"], kwargs["identifier"])
    if kind == "chain":
        return unified_chain(kwargs["chain"])
    if kind == "market":
        return unified_market(kwargs["asset"])
    return {}
