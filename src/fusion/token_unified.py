# EVM on-chain token modules (you already have RPC via Alchemy/Infura)
# from src.chains.evm.tokens import get_evm_token_info, get_evm_token_transfers
# Solana token modules (to add)
# from src.chains.solana.tokens import get_spl_token_info, get_spl_token_transfers

def unified_token(chain: str, identifier: str) -> dict:
    """
    identifier:
      - EVM: contract_address
      - Solana: mint address
    """
    if chain in ("ethereum", "polygon", "base", "arbitrum", "optimism"):
        return {
            "info": None,       # get_evm_token_info(identifier)
            "transfers": None,  # get_evm_token_transfers(identifier)
        }

    if chain == "solana":
        return {
            "info": None,       # get_spl_token_info(identifier)
            "transfers": None,  # get_spl_token_transfers(identifier)
        }

    return {}
