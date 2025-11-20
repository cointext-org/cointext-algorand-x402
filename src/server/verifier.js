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
    console.debug('start verify payment', paymentReq, txid, nonce);
    let tx;
    try {
        tx = await this.algo.getTransaction(txid);
    } catch (e) {
        console.error('verifyPayment error', e);
        return { ok: false, reason: "tx_not_found_or_node_error" };
    }
    console.debug('verifyPayment success', tx);
    // The transaction object from indexer/algod
    let transaction = tx.transaction || tx["transaction"] || tx.txn || tx["txn"];
    if ('txn' in tx) {
        transaction = tx.txn;
    }
    if (!transaction) {
        console.error('verifyPayment error', 'invalid_tx_data');
        return { ok: false, reason: "invalid_tx_data" };
    }

    console.log({transaction})

    // Use camelCase field names as per SDK and REST API
    const paymentPart = transaction.paymentTransaction;
    const assetPart = transaction.assetTransferTransaction;

    console.log('verifyPayment paymentPart', paymentPart);
    console.log('verifyPayment assetPart', assetPart);

    // Check receiver address
    const receiver =
        (paymentPart && paymentPart.receiver) ||
        (assetPart && assetPart.receiver);
    if (receiver !== paymentReq.sellerAddress) {
        console.error('verifyPayment error', 'receiver_mismatch');
        return { ok: false, reason: "receiver_mismatch" };
    }
    console.log('verifyPayment receiver', receiver);


    // Check amount
    const amount =
        (paymentPart && paymentPart.amount) ||
        (assetPart && assetPart.amount);
    if (Number(amount) < paymentReq.amount) {
        console.error('verifyPayment error', 'amount_insufficient');
        return { ok: false, reason: "amount_insufficient" };
    }
    console.log('verifyPayment amount', amount);

    // Check asset
    const assetId =
        assetPart && assetPart.assetId !== undefined
        ? assetPart.assetId
        : 0;
    if (assetId !== paymentReq.assetId) {
        console.error('verifyPayment error', 'asset_mismatch');
        return { ok: false, reason: "asset_mismatch" };
    }
    console.log('verifyPayment assetId', assetId);

    // Check note for nonce
    const noteB64 = transaction.note;
    if (!noteB64) {
        console.error('verifyPayment error', 'no_note');
        return { ok: false, reason: "no_note" };
    }
    console.log('verifyPayment noteB64', noteB64);

    try {
        const noteBytes = Buffer.from(noteB64, "base64");
        const dec = new TextDecoder();
        const note = dec.decode(noteBytes);
        console.log('verifyPayment note', note);
        if (!note.includes(paymentReq.nonce) || !note.includes(nonce)) {
        console.error('verifyPayment error', 'nonce_mismatch');
        return { ok: false, reason: "nonce_mismatch" };
        }
    } catch (e) {
        console.error('verifyPayment error', 'note_decode_error');
        return { ok: false, reason: "note_decode_error" };
    }

    // Check if confirmed
    if (!transaction.confirmedRound) {
        console.error('verifyPayment error', 'not_confirmed');
        return { ok: false, reason: "not_confirmed" };
    }

    // Check expiry (anti-replay)
    const now = Math.floor(Date.now() / 1000);
    if (now > paymentReq.expiry) {
        console.error('verifyPayment error', 'payment_expired');
        return { ok: false, reason: "payment_expired" };
    }

    return { ok: true };
    }
}