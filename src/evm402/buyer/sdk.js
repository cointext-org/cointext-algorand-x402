import crypto from "crypto";
import { ethers } from "ethers";
import { X402_VERSION, BASE_NETWORK_ID, USDC_CONFIG, getEip712Domain, TRANSFER_WITH_AUTH_TYPES } from "../config.js";

export function generateAuthorization(from, to, amount, { validForSeconds = 60 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const validAfter = now;
  const validBefore = now + validForSeconds;
  const nonceBytes = crypto.randomBytes(32);
  const nonce = "0x" + nonceBytes.toString("hex");

  return {
    from,
    to,
    value: String(amount),
    validAfter: String(validAfter),
    validBefore: String(validBefore),
    nonce,
  };
}

export async function signAuthorization(signer, authorization) {
  const domain = getEip712Domain();

  const message = {
    from: authorization.from,
    to: authorization.to,
    value: authorization.value,
    validAfter: authorization.validAfter,
    validBefore: authorization.validBefore,
    nonce: authorization.nonce,
  };

  if (typeof signer._signTypedData === "function") {
    return signer._signTypedData(domain, TRANSFER_WITH_AUTH_TYPES, message);
  }

  // Fallback for raw private key
  if (typeof signer === "string" && signer.startsWith("0x")) {
    const wallet = new ethers.Wallet(signer);
    return wallet.signTypedData(domain, TRANSFER_WITH_AUTH_TYPES, message);
  }

  throw new Error("unsupported_signer_for_eip712");
}

export function createXPaymentHeader(authorization, signature) {
  const headerObj = {
    x402Version: X402_VERSION,
    scheme: "exact",
    network: BASE_NETWORK_ID,
    payload: {
      authorization,
      signature,
    },
  };

  const jsonStr = JSON.stringify(headerObj);
  return Buffer.from(jsonStr, "utf8").toString("base64");
}
