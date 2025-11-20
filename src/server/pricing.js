import crypto from "crypto";

/**
 * 一个简单的定价策略实现
 */
export class SimplePricing {
  /**
   * @param {Object} opts
   * @param {string} opts.sellerAddress
   * @param {string} opts.chain           // e.g. "algorand-testnet"
   * @param {number} [opts.assetId]       // 0 = ALGO
   * @param {number} [opts.basePrice]     // micro units
   * @param {number} [opts.ttlSeconds]
   */
  constructor({ sellerAddress, chain, assetId = 0, basePrice = 1000, ttlSeconds = 600 }) {
    this.sellerAddress = sellerAddress;
    this.chain = chain;
    this.assetId = assetId;
    this.basePrice = basePrice;
    this.ttlSeconds = ttlSeconds;
  }

  /**
   * 返回一个 PaymentRequest
   * @param {string} description
   * @param {number} [factor]
   * @returns {import('../types.js').PaymentRequest}
   */
  createPaymentRequest(description, factor = 1.0) {
    const now = Math.floor(Date.now() / 1000);
    return {
      version: "algox402-1.0",
      chain: this.chain,
      assetId: this.assetId,
      amount: Math.floor(this.basePrice * factor),
      sellerAddress: this.sellerAddress,
      description,
      expiry: now + this.ttlSeconds,
      nonce: crypto.randomUUID(),
      facilitatorAllowed: true,
    };
  }
}