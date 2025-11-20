import algosdk from "algosdk";

/**
 * 对 Algorand JS SDK 的简单封装
 */
export class AlgorandClient {
  /**
   * @param {import('../config.js').AlgorandConfig} cfg
   */
  constructor(cfg) {
    this.cfg = cfg;
    this.algod = new algosdk.Algodv2(
      cfg.algodToken,
      cfg.algodServer,
      cfg.algodPort
    );
    this.indexer = new algosdk.Indexer(
      cfg.indexerToken,
      cfg.indexerServer,
      cfg.indexerPort
    );
  }

  /**
   * 发送支付交易（ALGO 或 ASA）
   *
   * @param {Object} opts
   * @param {Uint8Array} opts.senderSk
   * @param {string} opts.senderAddr
   * @param {string} opts.receiver
   * @param {number} opts.amount        // micro units
   * @param {number} [opts.assetId]     // 0 = ALGO
   * @param {string} [opts.note]        // UTF-8 note
   * @returns {Promise<string>} txid
   */
  async sendPayment({ senderSk, senderAddr, receiver, amount, assetId = 0, note = "" }) {
    const suggestedParams = await this.algod.getTransactionParams().do();
    const enc = new TextEncoder();
    const noteBytes = note ? enc.encode(note) : undefined;

    let txn;
    if (assetId === 0) {
      // ALGO 原生支付
      txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        from: senderAddr,
        to: receiver,
        amount,
        note: noteBytes,
        suggestedParams,
      });
    } else {
      // ASA 资产转账
      txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        from: senderAddr,
        to: receiver,
        amount,
        assetIndex: assetId,
        note: noteBytes,
        suggestedParams,
      });
    }

    const signed = txn.signTxn(senderSk);
    const { txId } = await this.algod.sendRawTransaction(signed).do();

    // 可选：等待确认
    await this.waitForConfirmation(txId, 4);
    return txId;
  }

  /**
   * 等待交易确认
   * @param {string} txid
   * @param {number} [roundsToWait]
   */
  async waitForConfirmation(txid, roundsToWait = 4) {
    let lastRound = (await this.algod.status().do())["last-round"];
    const startRound = lastRound;
    while (lastRound < startRound + roundsToWait) {
      const pendingInfo = await this.algod.pendingTransactionInformation(txid).do();
      if (pendingInfo["confirmed-round"] && pendingInfo["confirmed-round"] > 0) {
        return pendingInfo;
      }
      lastRound++;
      await this.algod.statusAfterBlock(lastRound).do();
    }
    throw new Error("Transaction not confirmed after wait");
  }

  /**
   * 从 Indexer 查询交易
   * @param {string} txid
   * @returns {Promise<any>}
   */
  async getTransaction(txid) {
    const res = await this.indexer.lookupTransactionByID(txid).do();
    return res;
  }
}