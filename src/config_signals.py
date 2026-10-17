"""Protocols tracked by dev activity signal, with categories."""

DEV_TRACKED = [
    # === DeFi protocols (15) ===
    ("uniswap",    "Uniswap/v4-core",                           "defi"),
    ("aave",       "aave/aave-v3-core",                          "defi"),
    ("curve",      "curvefi/curve-contract",                     "defi"),
    ("compound",   "compound-finance/compound-protocol",         "defi"),
    ("maker",      "makerdao/dss",                                "defi"),
    ("lido",       "lidofinance/lido-dao",                        "defi"),
    ("rocketpool", "rocket-pool/rocketpool",                      "defi"),
    ("balancer",   "balancer/balancer-v2-monorepo",               "defi"),
    ("sushiswap",  "sushiswap/sushiswap",                         "defi"),
    ("yearn",      "yearn/yearn-vaults",                          "defi"),
    ("convex",     "convex-eth/convex",                           "defi"),
    ("frax",       "FraxFinance/frax-solidity",                   "defi"),
    ("gmx",        "gmx-io/gmx-contracts",                        "defi"),
    ("pendle",     "pendle-finance/pendle-core-v2",               "defi"),
    ("ethena",     "ethena-labs/ethena",                          "defi"),

    # === L1 base chains (6) ===
    ("bitcoin",    "bitcoin/bitcoin",                             "l1_chains"),
    ("ethereum",   "ethereum/go-ethereum",                        "l1_chains"),
    ("solana",     "solana-labs/solana",                          "l1_chains"),
    ("polkadot",   "paritytech/polkadot-sdk",                     "l1_chains"),
    ("cosmos",     "cosmos/cosmos-sdk",                           "l1_chains"),
    ("avalanche",  "ava-labs/avalanchego",                        "l1_chains"),

    # === L2 rollups (4) ===
    ("arbitrum",   "OffchainLabs/arbitrum",                       "l2_rollups"),
    ("optimism",   "ethereum-optimism/optimism",                  "l2_rollups"),
    ("starknet",   "starkware-libs/cairo",                        "l2_rollups"),
    ("zksync",     "matter-labs/zksync-era",                      "l2_rollups"),

    # === Infrastructure (3) ===
    ("chainlink",  "smartcontractkit/chainlink",                  "infrastructure"),
    ("thegraph",   "graphprotocol/graph-node",                    "infrastructure"),
    ("ipfs",       "ipfs/kubo",                                   "infrastructure"),

    # === Tooling (3) ===
    ("foundry",    "foundry-rs/foundry",                          "tooling"),
    ("reth",       "paradigmxyz/reth",                            "tooling"),
    ("hardhat",    "NomicFoundation/hardhat",                     "tooling"),

    # === Wallets (2) ===
    ("metamask",   "MetaMask/metamask-extension",                 "wallets"),
    ("rainbow",    "rainbow-me/rainbow",                          "wallets"),

    # === Bridges (2) ===
    ("wormhole",   "wormhole-foundation/wormhole",                "bridges"),
    ("axelar",     "axelarnetwork/axelar",                        "bridges"),
]


NFT_TRACKED = [
    ("mad_lads",           "solana"),
    ("degods",             "solana"),
    ("tensorians",         "solana"),
    ("okay_bears",         "solana"),
    ("smb_gen2",          "solana"),
]
    