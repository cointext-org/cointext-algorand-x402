/**
 * Express 中间件工厂：实现 x402-style 支付拦截
 *
 * 用法示例：
 *   const paywall = createAlgox402Middleware({ pricing, verifier });
 *   app.get("/protected", paywall, handler);
 */

import logger from "../logger.js";

const NONCE_HEADER = "x-algox402-nonce";

// 内部简单缓存 nonce -> PaymentRequest（生产可以换成 Redis 等）
const paymentRequestCache = new Map();

/**
 * @param {Object} opts
 * @param {import('./pricing.js').SimplePricing} opts.pricing
 * @param {import('./verifier.js').PaymentVerifier} opts.verifier
 * @returns {import('express').RequestHandler}
 */
export function createAlgox402Middleware({ pricing, verifier }) {
  return async function algox402Middleware(req, res, next) {
    try {
      const paymentProof = req.query.payment_proof;
      const clientNonce = req.header(NONCE_HEADER);

      // 第一次访问，没有付款凭证 -> 返回 402 + PaymentRequest
      if (!paymentProof) {
        const description = `${req.method} ${req.path}`;
        const paymentReq = pricing.createPaymentRequest(description);
        // 缓存起来，后面用 nonce 取出
        paymentRequestCache.set(paymentReq.nonce, paymentReq);

        res.status(402).json({
          payment: paymentReq,
        });
        return;
      }

      // 有付款凭证：必须有 nonce
      if (!clientNonce) {
        res.status(402).json({
          error: "missing_nonce",
          detail: `Header ${NONCE_HEADER} is required when providing payment_proof`,
        });
        return;
      }

      const paymentReq = paymentRequestCache.get(clientNonce);
      if (!paymentReq) {
        res.status(402).json({
          error: "payment_request_not_found",
          detail: "nonce not recognized or expired",
        });
        return;
      }

      const verifyResult = await verifier.verifyPayment(
        paymentReq,
        String(paymentProof),
        clientNonce
      );

      if (!verifyResult.ok) {
        res.status(402).json({
          error: "payment_invalid",
          detail: verifyResult.reason,
        });
        return;
      }

      // 支付通过，可以删除缓存的 paymentReq（防重放）
      paymentRequestCache.delete(clientNonce);

      // 放行后续 handler
      next();
    } catch (e) {
      logger.error("[algox402] middleware error:", e);
      res.status(500).json({ error: "internal_error" });
    }
  };
}