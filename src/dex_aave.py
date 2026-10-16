# volatiai/src/dex_aave.py
from .dex_rpc import get_web3

AAVE_POOL_ABI = [
    {
        "name": "getReserveData",
        "inputs": [{"name": "asset", "type": "address"}],
        "outputs": [
            {
                "name": "data",
                "type": "tuple",
                "components": [
                    {"name": "liquidityIndex",                 "type": "uint256"},
                    {"name": "currentLiquidityRate",           "type": "uint256"},
                    {"name": "variableBorrowIndex",            "type": "uint256"},
                    {"name": "currentVariableBorrowRate",      "type": "uint256"},
                    {"name": "currentStableBorrowRate",        "type": "uint256"},
                    {"name": "lastUpdateTimestamp",            "type": "uint40"},
                    {"name": "id",                             "type": "uint16"},
                    {"name": "aTokenAddress",                  "type": "address"},
                    {"name": "stableDebtTokenAddress",         "type": "address"},
                    {"name": "variableDebtTokenAddress",       "type": "address"},
                    {"name": "interestRateStrategyAddress",    "type": "address"},
                    {"name": "accruedToTreasury",              "type": "uint128"},
                    {"name": "unbacked",                       "type": "uint128"},
                    {"name": "isolationModeTotalDebt",         "type": "uint128"},
                ],
            }
        ],
        "stateMutability": "view",
        "type": "function",
    },
]


def aave_get_reserve_data(pool_address: str, asset: str) -> dict:
    """
    Fetch AAVE V3 reserve data for a given asset.

    Returns a dict with the 14 struct fields plus the input echo.
    Raises on RPC or contract errors — do not swallow here.
    """
    w3 = get_web3()

    contract = w3.eth.contract(
        address=w3.to_checksum_address(pool_address),
        abi=AAVE_POOL_ABI,
    )

    raw = contract.functions.getReserveData(
        w3.to_checksum_address(asset)
    ).call()

    # web3 returns a tuple in component order
    (
        liquidityIndex,
        currentLiquidityRate,
        variableBorrowIndex,
        currentVariableBorrowRate,
        currentStableBorrowRate,
        lastUpdateTimestamp,
        reserve_id,
        aTokenAddress,
        stableDebtTokenAddress,
        variableDebtTokenAddress,
        interestRateStrategyAddress,
        accruedToTreasury,
        unbacked,
        isolationModeTotalDebt,
    ) = raw

    # AAVE rates are RAY (1e27). Convert to human-readable percentages.
    RAY = 10**27

    return {
        "pool": pool_address,
        "asset": asset,
        "liquidity_index": liquidityIndex / RAY,
        "supply_apy": (currentLiquidityRate / RAY) * 100,
        "variable_borrow_index": variableBorrowIndex / RAY,
        "variable_borrow_apy": (currentVariableBorrowRate / RAY) * 100,
        "stable_borrow_apy": (currentStableBorrowRate / RAY) * 100,
        "last_update": lastUpdateTimestamp,
        "id": reserve_id,
        "a_token": aTokenAddress,
        "stable_debt_token": stableDebtTokenAddress,
        "variable_debt_token": variableDebtTokenAddress,
        "interest_rate_strategy": interestRateStrategyAddress,
        "accrued_to_treasury": accruedToTreasury,
        "unbacked": unbacked,
        "isolation_mode_debt": isolationModeTotalDebt,
    }
