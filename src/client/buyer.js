import fetch from "node-fetch";

/**
 * Buyer 客户端：自动完成
 * 1. 发起请求
 * 2. 收到 402 + PaymentRequest
 * 3. 调用 Algorand 支付
 * 4. 带 txid + nonce 重试
 */
export class Algox402Buyer {
  /**
   * @param {import('../algorand/client.js').AlgorandClient} algoClient
   * @param {Object} account  // algosdk.mnemonicToSecretKey(...) 的结果
   * @param {string} account.addr
   * @param {Uint8Array} account.sk
   */
  constructor(algoClient, account) {
    this.algo = algoClient;
    this.account = account;
  }

  /**
   * @param {string} method
   * @param {string} url
   * @param {Object} [options]
   * @returns {Promise<import('node-fetch').Response>}
   */
  async request(method, url, options = {}) {
    const init = {
      method,
      headers: options.headers || {},
    };

    // 第一次尝试
    let resp = await fetch(url, init);

    if (resp.status !== 402) {
      return resp;
    }

    const body = await resp.json();
    const paymentReq = body.payment;
    if (!paymentReq) {
      throw new Error("402 response without payment object");
    }
    console.log(paymentReq)

    // 支付
    const note = `algox402:${paymentReq.nonce}:${url}`;
    const txid = await this.algo.sendPayment({
      senderSk: this.account.sk,
      senderAddr: this.account.addr,
      receiver: paymentReq.sellerAddress,
      amount: paymentReq.amount,
      assetId: paymentReq.assetId,
      note,
    });

    // 带付款凭证重试
    const urlObj = new URL(url);
    urlObj.searchParams.set("payment_proof", txid);

    const headers = {
      ...(options.headers || {}),
      "Content-Type": "application/json",
      "X-Algox402-Nonce": paymentReq.nonce,
    };

    const secondInit = {
      method,
      headers,
    };

    return fetch(urlObj.toString(), secondInit);
  }
}