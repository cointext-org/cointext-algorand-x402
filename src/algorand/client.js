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
      // sender, receiver, amount, closeRemainderTo, suggestedParams, note, lease, rekeyTo, 
      txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: senderAddr,
        receiver,
        amount,
        note: noteBytes,
        suggestedParams,
      });
    } else {
      // ASA 资产转账
      txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: senderAddr,
        receiver,
        amount,
        assetIndex: assetId,
        note: noteBytes,
        suggestedParams,
      });
    }

    const signed = txn.signTxn(senderSk);
    const res = await this.algod.sendRawTransaction(signed).do();

    // 可选：等待确认
    await this.waitForConfirmation(res.txid, 4);
    return res.txid;
  }

  /**
   * 等待交易确认
   * @param {string} txid
   * @param {number} [roundsToWait]
   */
  async waitForConfirmation(txid, roundsToWait = 4) {
    // SDK may return BigInt for lastRound; keep arithmetic in BigInt and
    // only convert to Number when calling SDK methods.
    let lastRound = (await this.algod.status().do()).lastRound;
    if (typeof lastRound === "number") {
      lastRound = BigInt(lastRound);
    }

    console.log("Waiting for confirmation...", lastRound);

    const waitRounds = BigInt(roundsToWait);
    const maxRound = lastRound + waitRounds;

    while (lastRound < maxRound) {
      console.log("Waiting for confirmation...", lastRound, txid);
      try{
        const pendingInfo = await this.algod.pendingTransactionInformation(txid).do();
        // console.log("Pending info:", pendingInfo);

        const confirmedRound = pendingInfo.confirmedRound;
        if (
            confirmedRound !== undefined &&
            confirmedRound !== null &&
            ((typeof confirmedRound === "bigint" && confirmedRound > 0n) ||
            (typeof confirmedRound === "number" && confirmedRound > 0))
        ) {
            return pendingInfo;
        }

        lastRound += 1n;
        await this.algod.statusAfterBlock(Number(lastRound)).do();
      }catch(e){
        // console.log(e)
        await new Promise(resolve => setTimeout(resolve, 1000));
        lastRound += 1n;
      }
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