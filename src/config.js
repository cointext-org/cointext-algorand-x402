/**
 * Algorand 网络配置
 */
export class AlgorandConfig {
  /**
   * @param {Object} opts
   * @param {string} opts.algodToken
   * @param {string} opts.algodServer
   * @param {number} opts.algodPort
   * @param {string} opts.indexerToken
   * @param {string} opts.indexerServer
   * @param {number} opts.indexerPort
   * @param {string} [opts.network]        // "algorand-testnet" / "algorand-mainnet" / "localnet"
   * @param {number} [opts.defaultAssetId] // 0 = ALGO
   */
  constructor(opts) {
    this.algodToken = opts.algodToken;
    this.algodServer = opts.algodServer;
    this.algodPort = opts.algodPort;
    this.indexerToken = opts.indexerToken;
    this.indexerServer = opts.indexerServer;
    this.indexerPort = opts.indexerPort;
    this.network = opts.network || "algorand-testnet";
    this.defaultAssetId = opts.defaultAssetId ?? 0;
  }
}