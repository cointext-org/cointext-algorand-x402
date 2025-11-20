import { TextDecoder } from "util";

/**
 * 支付验证器：根据 PaymentRequest 验证某个 txid 是否符合要求
 */
export class PaymentVerifier {
  /**
   * @param {import('../algorand/client.js').AlgorandClient} algoClient
   */
  constructor(algoClient) {
    this.algo = algoClient;
  }

  /**
   * @param {import('../types.js').PaymentRequest} paymentReq
   * @param {string} txid
   * @param {string} nonce
   * @returns {Promise<import('../types.js').VerifyResult>}
   */
  async verifyPayment(paymentReq, txid, nonce) {
    let tx;
    try {
      tx = await this.algo.getTransaction(txid);
    } catch (e) {
      return { ok: false, reason: "tx_not_found_or_node_error" };
    }

    const transaction = tx.transaction || tx["transaction"];
    if (!transaction) {
      return { ok: false, reason: "invalid_tx_data" };
    }

    const paymentPart = transaction["payment-transaction"];
    const assetPart = transaction["asset-transfer-transaction"];

    // 检查接收地址
    const receiver =
      (paymentPart && paymentPart.receiver) ||
      (assetPart && assetPart.receiver);
    if (receiver !== paymentReq.sellerAddress) {
      return { ok: false, reason: "receiver_mismatch" };
    }

    // 检查金额
    const amount =
      (paymentPart && paymentPart.amount) ||
      (assetPart && assetPart.amount);
    if (Number(amount) < paymentReq.amount) {
      return { ok: false, reason: "amount_insufficient" };
    }

    // 检查资产
    const assetId =
      assetPart && assetPart["asset-id"] !== undefined
        ? assetPart["asset-id"]
        : 0;
    if (assetId !== paymentReq.assetId) {
      return { ok: false, reason: "asset_mismatch" };
    }

    // 检查 note 中的 nonce
    const noteB64 = transaction.note;
    if (!noteB64) {
      return { ok: false, reason: "no_note" };
    }

    try {
      const noteBytes = Buffer.from(noteB64, "base64");
      const dec = new TextDecoder();
      const note = dec.decode(noteBytes);
      if (!note.includes(paymentReq.nonce) || !note.includes(nonce)) {
        return { ok: false, reason: "nonce_mismatch" };
      }
    } catch (e) {
      return { ok: false, reason: "note_decode_error" };
    }

    // 检查是否确认
    if (!tx["confirmed-round"]) {
      return { ok: false, reason: "not_confirmed" };
    }

    // 检查是否过期（防重放）
    const now = Math.floor(Date.now() / 1000);
    if (now > paymentReq.expiry) {
      return { ok: false, reason: "payment_expired" };
    }

    return { ok: true };
  }
}