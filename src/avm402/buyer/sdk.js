import crypto from "crypto";
import { signAuthorizationWithAccount } from "./auth.js";

export const AVM_X402_VERSION = 1;

export function generateAuthorization(payer, seller, assetId, amount, resource, { validForSeconds = 60 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const validAfter = now;
  const validBefore = now + validForSeconds;
  const nonceBytes = crypto.randomBytes(32);
  const nonce = nonceBytes.toString("base64");

  return {
    payer,
    seller,
    assetId: Number(assetId ?? 0),
    amount: String(amount),
    validAfter: String(validAfter),
    validBefore: String(validBefore),
    nonce,
    resource: String(resource || ""),
  };
}

export function signAuthorization(account, authorization) {
  return signAuthorizationWithAccount(account, authorization);
}

export function createXPaymentHeader(authorization, signature, network = "algorand-testnet") {
  const headerObj = {
    x402Version: AVM_X402_VERSION,
    scheme: "exact",
    network,
    payload: {
      authorization,
      signature,
    },
  };
  const json = JSON.stringify(headerObj);
  return Buffer.from(json, "utf8").toString("base64");
}
