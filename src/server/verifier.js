import { TextDecoder } from "util";
import logger from "../logger.js";

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
    logger.debug('start verify payment', paymentReq, txid, nonce);

    let tx;
    try {
        tx = await this.algo.getTransaction(txid);
    } catch (e) {
        logger.error('verifyPayment error', e);
        return { ok: false, reason: "tx_not_found_or_node_error" };
    }
    logger.debug('verifyPayment success', tx);

    // The transaction object from indexer/algod
    let transaction = tx.transaction || tx["transaction"] || tx.txn || tx["txn"];
    if ('txn' in tx) {
        transaction = tx.txn;
    }
    if (!transaction) {
        logger.error('verifyPayment error', 'invalid_tx_data');
        return { ok: false, reason: "invalid_tx_data" };
    }

    logger.info({transaction})

    // Use camelCase field names as per SDK and REST API
    const paymentPart = transaction.paymentTransaction;
    const assetPart = transaction.assetTransferTransaction;

    logger.info('verifyPayment paymentPart', paymentPart);
    logger.info('verifyPayment assetPart', assetPart);

    // Check receiver address
    const receiver =
        (paymentPart && paymentPart.receiver) ||
        (assetPart && assetPart.receiver);
    if (receiver !== paymentReq.sellerAddress) {
        logger.error('verifyPayment error', 'receiver_mismatch');
        return { ok: false, reason: "receiver_mismatch" };
    }
    logger.info('verifyPayment receiver', receiver);


    // Check amount
    const amount =
        (paymentPart && paymentPart.amount) ||
        (assetPart && assetPart.amount);
    if (Number(amount) < paymentReq.amount) {
        logger.error('verifyPayment error', 'amount_insufficient');
        return { ok: false, reason: "amount_insufficient" };
    }
    logger.info('verifyPayment amount', amount);

    // Check asset
    const assetId =
        assetPart && assetPart.assetId !== undefined
        ? assetPart.assetId
        : 0;
    if (assetId !== paymentReq.assetId) {
        logger.error('verifyPayment error', 'asset_mismatch');
        return { ok: false, reason: "asset_mismatch" };
    }
    logger.info('verifyPayment assetId', assetId);

    // Check note for nonce
    const noteB64 = transaction.note;
    if (!noteB64) {
        logger.error('verifyPayment error', 'no_note');
        return { ok: false, reason: "no_note" };
    }
    logger.info('verifyPayment noteB64', noteB64);

    try {
        const noteBytes = Buffer.from(noteB64, "base64");
        const dec = new TextDecoder();
        const note = dec.decode(noteBytes);
        logger.info('verifyPayment note', note);
        if (!note.includes(paymentReq.nonce) || !note.includes(nonce)) {
        logger.error('verifyPayment error', 'nonce_mismatch');
        return { ok: false, reason: "nonce_mismatch" };
        }
    } catch (e) {
        logger.error('verifyPayment error', 'note_decode_error');
        return { ok: false, reason: "note_decode_error" };
    }

    // Check if confirmed
    if (!transaction.confirmedRound) {
        logger.error('verifyPayment error', 'not_confirmed');
        return { ok: false, reason: "not_confirmed" };
    }

    // Check expiry (anti-replay)
    const now = Math.floor(Date.now() / 1000);
    if (now > paymentReq.expiry) {
        logger.error('verifyPayment error', 'payment_expired');
        return { ok: false, reason: "payment_expired" };
    }

    return { ok: true };
    }
}