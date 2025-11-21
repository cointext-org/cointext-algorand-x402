import fetch from "node-fetch";
import { AVM_X402_VERSION } from "../buyer/sdk.js";

const X_PAYMENT_HEADER = "x-payment";
const X_PAYMENT_RESPONSE_HEADER = "x-payment-response";

export function avmPaymentMiddleware(payTo, routeConfig, facilitatorConfig) {
  const { maxAmountRequired, assetId = 0, maxTimeoutSeconds = 60, network = "algorand-testnet" } = routeConfig;
  const { baseUrl } = facilitatorConfig;

  return async function avmX402Middleware(req, res, next) {
    try {
      const rawHeader = req.header(X_PAYMENT_HEADER);

      if (!rawHeader) {
        const resource = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
        res.status(402).json({
          x402Version: AVM_X402_VERSION,
          accepts: [
            {
              scheme: "exact",
              network,
              maxAmountRequired,
              payTo,
              assetId,
              resource,
              maxTimeoutSeconds,
            },
          ],
        });
        return;
      }

      const resource = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
      const paymentRequirements = {
        scheme: "exact",
        network,
        maxAmountRequired,
        payTo,
        assetId,
        resource,
      };

      const verifyResp = await fetch(`${baseUrl}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          x402Version: AVM_X402_VERSION,
          paymentHeader: rawHeader,
          paymentRequirements,
        }),
      });

      if (!verifyResp.ok) {
        res.status(402).json({ error: "verify_http_error" });
        return;
      }

      const verifyBody = await verifyResp.json();
      if (!verifyBody.isValid) {
        res.status(402).json({ error: "payment_invalid", detail: verifyBody.invalidReason });
        return;
      }

      const settleResp = await fetch(`${baseUrl}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          x402Version: AVM_X402_VERSION,
          paymentHeader: rawHeader,
          paymentRequirements,
        }),
      });

      if (!settleResp.ok) {
        res.status(402).json({ error: "settle_http_error" });
        return;
      }

      const settleBody = await settleResp.json();
      if (!settleBody.success) {
        res.status(402).json({ error: "payment_not_settled", detail: settleBody.error });
        return;
      }

      let payer = null;
      try {
        let jsonStr = rawHeader.trim();
        if (!jsonStr.startsWith("{")) {
          jsonStr = Buffer.from(jsonStr, "base64").toString("utf8");
        }
        const obj = JSON.parse(jsonStr);
        payer = obj?.payload?.authorization?.payer || null;
      } catch (_) {}

      const responsePayload = {
        success: true,
        transaction: settleBody.transaction,
        network,
        payer,
      };

      const encoded = Buffer.from(JSON.stringify(responsePayload), "utf8").toString("base64");
      res.set(X_PAYMENT_RESPONSE_HEADER, encoded);

      next();
    } catch (e) {
      res.status(500).json({ error: "avm_payment_middleware_error" });
    }
  };
}
