// 一些简单的 JSDoc 类型注释，方便编辑器智能提示

/**
 * @typedef {Object} PaymentRequest
 * @property {string} version
 * @property {string} chain
 * @property {number} assetId
 * @property {number} amount      // micro units
 * @property {string} sellerAddress
 * @property {string} description
 * @property {number} expiry      // unix epoch (seconds)
 * @property {string} nonce
 * @property {boolean} facilitatorAllowed
 */

/**
 * @typedef {Object} VerifyResult
 * @property {boolean} ok
 * @property {string} [reason]
 */

export {};