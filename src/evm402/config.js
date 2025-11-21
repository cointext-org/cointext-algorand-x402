export const X402_VERSION = 1;

// Base mainnet example config; you can change via env vars if needed.
export const BASE_NETWORK_ID = "base";
export const BASE_CHAIN_ID = 8453;

// USDC on Base mainnet (placeholder, replace with actual if needed)
export const USDC_CONFIG = {
  name: "USD Coin",
  version: "2",
  symbol: "USDC",
  decimals: 6,
  contract: process.env.USDC_ADDRESS || "0x0000000000000000000000000000000000000000",
};

export const FACILITATOR_CONFIG = {
  network: BASE_NETWORK_ID,
  rpcUrl: process.env.BASE_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/demo", // replace in prod
  privateKey: process.env.FACILITATOR_PK || "0x", // must be set for settle
};

export function getEip712Domain() {
  return {
    name: USDC_CONFIG.name,
    version: USDC_CONFIG.version,
    chainId: BASE_CHAIN_ID,
    verifyingContract: USDC_CONFIG.contract,
  };
}

export const TRANSFER_WITH_AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};
