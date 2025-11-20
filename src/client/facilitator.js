import fetch from "node-fetch";

/**
 * Facilitator：代付方。简单实现：
 * - 管理 buyerId -> quota（额度）
 * - 接到 402 后，用自己的账户支付
 */
export class Algox402Facilitator {
  /**
   * @param {import('../algorand/client.js').AlgorandClient} algoClient
   * @param {Object} account   // 代付账户（addr + sk）
   */
  constructor(algoClient, account) {
    this.algo = algoClient;
    this.account = account;
    this.balances = new Map(); // buyerId -> quota(micro)
  }

  registerBuyer(buyerId, quotaMicro) {
    this.balances.set(buyerId, quotaMicro);
  }

  _chargeQuota(buyerId, amount) {
    const current = this.balances.get(buyerId) ?? 0;
    if (current < amount) return false;
    this.balances.set(buyerId, current - amount);
    return true;
  }

  /**
   * 为某个 buyerId 代发请求并代付
   * @param {string} buyerId
   * @param {string} method
   * @param {string} url
   * @param {Object} [options]
   */
  async requestFor(buyerId, method, url, options = {}) {
    const init = {
      method,
      headers: options.headers || {},
    };

    let resp = await fetch(url, init);
    if (resp.status !== 402) {
      return resp;
    }

    const body = await resp.json();
    const paymentReq = body.payment;
    if (!paymentReq) {
      throw new Error("402 response without payment object");
    }

    if (!this._chargeQuota(buyerId, paymentReq.amount)) {
      throw new Error("quota_exceeded");
    }

    const note = `algox402-facilitator:${buyerId}:${paymentReq.nonce}:${url}`;
    const txid = await this.algo.sendPayment({
      senderSk: this.account.sk,
      senderAddr: this.account.addr,
      receiver: paymentReq.sellerAddress,
      amount: paymentReq.amount,
      assetId: paymentReq.assetId,
      note,
    });

    const urlObj = new URL(url);
    urlObj.searchParams.set("payment_proof", txid);

    const headers = {
      ...(options.headers || {}),
      "Content-Type": "application/json",
      "X-Algox402-Nonce": paymentReq.nonce,
    };

    const secondInit = { method, headers };
    return fetch(urlObj.toString(), secondInit);
  }
}