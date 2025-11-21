import express from "express";
import crypto from "crypto";
import algosdk from "algosdk";
import { AlgorandConfig } from "../config.js";
import { AlgorandClient } from "../algorand/client.js";
import logger from "../logger.js";
import {
  AVM_X402_VERSION,
  generateAuthorization,
} from "./buyer/sdk.js";
import {
  decodeXPayment,
  extractAuthorizationFromHeaderObj,
  verifyAuthorizationSignature,
} from "./auth.js";

// nonce / payment 状态：pending / success / failed
const authorizationState = new Map();

function hashPaymentHeader(rawHeader) {
  const buf = Buffer.from(String(rawHeader || ""), "utf8");
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function getAlgoClientFromEnv() {
  const cfg = new AlgorandConfig({
    algodToken: process.env.ALGOD_TOKEN || "",
    algodServer: process.env.ALGOD_SERVER || "http://localhost",
    algodPort: Number(process.env.ALGOD_PORT || 4001),
    indexerToken: process.env.INDEXER_TOKEN || "",
    indexerServer: process.env.INDEXER_SERVER || "http://localhost",
    indexerPort: Number(process.env.INDEXER_PORT || 8980),
    network: process.env.ALGORAND_NETWORK || "algorand-testnet",
    defaultAssetId: Number(process.env.ALGORAND_DEFAULT_ASSET_ID || 0),
  });
  return new AlgorandClient(cfg);
}

const algoClient = getAlgoClientFromEnv();

function getFacilitatorAccount() {
  const m = process.env.FACILITATOR_MNEMONIC;
  if (!m) {
    throw new Error("FACILITATOR_MNEMONIC not set");
  }
  return algosdk.mnemonicToSecretKey(m);
}

function validatePaymentRequirements(headerObj, requirements) {
  if (!requirements) return "missing_requirements";

  if (headerObj.scheme !== requirements.scheme) {
    return "scheme_mismatch";
  }
  if (headerObj.network !== requirements.network) {
    return "network_mismatch";
  }

  const extracted = extractAuthorizationFromHeaderObj(headerObj);
  if (!extracted) return "missing_authorization";
  const { authorization } = extracted;

  if (authorization.seller !== requirements.payTo) {
    return "payTo_mismatch";
  }

  if (Number(authorization.assetId ?? 0) !== Number(requirements.assetId ?? 0)) {
    return "asset_mismatch";
  }

  const value = BigInt(authorization.amount);
  const max = BigInt(requirements.maxAmountRequired);
  if (value > max) {
    return "amount_too_large";
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  const validAfter = BigInt(authorization.validAfter);
  const validBefore = BigInt(authorization.validBefore);
  if (now < validAfter || now > validBefore) {
    return "authorization_expired";
  }

  if (requirements.resource && authorization.resource !== requirements.resource) {
    return "resource_mismatch";
  }

  return null;
}

function basicVerify(headerObj) {
  const extracted = extractAuthorizationFromHeaderObj(headerObj);
  if (!extracted) {
    return { ok: false, reason: "missing_payload" };
  }

  const { authorization, signature } = extracted;

  const ok = verifyAuthorizationSignature(authorization.payer, authorization, signature);
  if (!ok) {
    return { ok: false, reason: "invalid_signature" };
  }

  return { ok: true, authorization };
}

async function settleOnChain(authorization) {
  const facilitator = getFacilitatorAccount();
  const txid = await algoClient.sendPayment({
    senderSk: facilitator.sk,
    senderAddr: facilitator.addr,
    receiver: authorization.seller,
    amount: Number(authorization.amount),
    assetId: Number(authorization.assetId ?? 0),
    note: `algox402-avm:${authorization.nonce}:${authorization.resource}`,
  });
  return txid;
}

export function createAvmFacilitatorApp() {
  const app = express();
  app.use(express.json());

  app.post("/verify", async (req, res) => {
    try {
      const { x402Version, paymentHeader, paymentRequirements } = req.body || {};
      if (x402Version !== AVM_X402_VERSION) {
        return res.status(400).json({ isValid: false, invalidReason: "unsupported_x402_version" });
      }

      const rawHeader = String(paymentHeader || "");
      const headerObj = decodeXPayment(rawHeader);

      const reasonReq = validatePaymentRequirements(headerObj, paymentRequirements);
      if (reasonReq) {
        return res.json({ isValid: false, invalidReason: reasonReq });
      }

      const verifyResult = basicVerify(headerObj);
      if (!verifyResult.ok) {
        return res.json({ isValid: false, invalidReason: verifyResult.reason });
      }

      const key = hashPaymentHeader(rawHeader);
      const state = authorizationState.get(key);
      if (state && state.status === "failed") {
        return res.json({ isValid: false, invalidReason: "nonce_failed" });
      }

      return res.json({ isValid: true, invalidReason: null });
    } catch (e) {
      logger.error("/verify error", e);
      return res.status(500).json({ isValid: false, invalidReason: "internal_error" });
    }
  });

  app.post("/settle", async (req, res) => {
    try {
      const { x402Version, paymentHeader, paymentRequirements } = req.body || {};
      if (x402Version !== AVM_X402_VERSION) {
        return res.status(400).json({ success: false, error: "unsupported_x402_version" });
      }

      const rawHeader = String(paymentHeader || "");
      const headerObj = decodeXPayment(rawHeader);

      const reasonReq = validatePaymentRequirements(headerObj, paymentRequirements);
      if (reasonReq) {
        return res.json({ success: false, error: reasonReq });
      }

      const verifyResult = basicVerify(headerObj);
      if (!verifyResult.ok) {
        return res.json({ success: false, error: verifyResult.reason });
      }

      const key = hashPaymentHeader(rawHeader);
      const existing = authorizationState.get(key);
      if (existing) {
        if (existing.status === "success") {
          return res.json({ success: true, transaction: existing.txid, network: paymentRequirements.network });
        }
        if (existing.status === "pending") {
          return res.json({ success: false, error: "settlement_pending" });
        }
        if (existing.status === "failed") {
          return res.json({ success: false, error: "nonce_failed" });
        }
      }

      authorizationState.set(key, { status: "pending" });

      let txid;
      try {
        txid = await settleOnChain(verifyResult.authorization);
      } catch (e) {
        logger.error("settleOnChain error", e);
        authorizationState.set(key, { status: "failed" });
        return res.json({ success: false, error: "onchain_settle_failed" });
      }

      authorizationState.set(key, { status: "success", txid });
      return res.json({ success: true, transaction: txid, network: paymentRequirements.network });
    } catch (e) {
      logger.error("/settle error", e);
      return res.status(500).json({ success: false, error: "internal_error" });
    }
  });

  return app;
}

export function startAvmFacilitatorServer(port = 4100) {
  const app = createAvmFacilitatorApp();
  app.listen(port, () => {
    console.log(`Algorand x402 AVM facilitator listening on :${port}`);
  });
}
