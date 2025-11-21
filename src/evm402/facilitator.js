import express from "express";
import { ethers } from "ethers";
import crypto from "crypto";
import {
  X402_VERSION,
  BASE_NETWORK_ID,
  FACILITATOR_CONFIG,
  USDC_CONFIG,
  getEip712Domain,
  TRANSFER_WITH_AUTH_TYPES,
} from "./config.js";

// In-memory nonce/payment state
// key: hash(paymentHeader JSON string) or authorization.nonce
// value: { status: "pending" | "success" | "failed", txHash?: string }
const authorizationState = new Map();

function hashPaymentHeader(rawHeader) {
  const buf = Buffer.from(rawHeader, "utf8");
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function decodeXPayment(raw) {
  // raw may be base64 or JSON string
  let jsonStr = raw.trim();
  if (!jsonStr.startsWith("{")) {
    const decoded = Buffer.from(jsonStr, "base64").toString("utf8");
    jsonStr = decoded;
  }
  const obj = JSON.parse(jsonStr);
  if (obj.x402Version !== X402_VERSION) {
    throw new Error("unsupported_x402_version");
  }
  return obj;
}

function validatePaymentRequirements(headerObj, requirements) {
  if (headerObj.scheme !== requirements.scheme) {
    return "scheme_mismatch";
  }
  if (headerObj.network !== requirements.network) {
    return "network_mismatch";
  }

  const { authorization } = headerObj.payload || {};
  if (!authorization) {
    return "missing_authorization";
  }

  if (authorization.to.toLowerCase() !== requirements.payTo.toLowerCase()) {
    return "payTo_mismatch";
  }

  if (
    requirements.asset &&
    requirements.asset.toLowerCase() !== USDC_CONFIG.contract.toLowerCase()
  ) {
    return "asset_mismatch";
  }

  // value <= maxAmountRequired
  const value = BigInt(authorization.value);
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

  return null;
}

function verifySignature(headerObj) {
  const { authorization, signature } = headerObj.payload || {};
  if (!authorization || !signature) {
    return { ok: false, reason: "missing_payload" };
  }

  const domain = getEip712Domain();

  // Hard-check chainId & verifyingContract (S4)
  if (domain.chainId !== 8453) {
    return { ok: false, reason: "invalid_chainId" };
  }
  if (domain.verifyingContract.toLowerCase() !== USDC_CONFIG.contract.toLowerCase()) {
    return { ok: false, reason: "invalid_verifying_contract" };
  }

  const message = {
    from: authorization.from,
    to: authorization.to,
    value: authorization.value,
    validAfter: authorization.validAfter,
    validBefore: authorization.validBefore,
    nonce: authorization.nonce,
  };

  let recovered;
  try {
    recovered = ethers.verifyTypedData(domain, TRANSFER_WITH_AUTH_TYPES, message, signature);
  } catch (e) {
    return { ok: false, reason: "invalid_signature" };
  }

  if (recovered.toLowerCase() !== authorization.from.toLowerCase()) {
    return { ok: false, reason: "signer_mismatch" };
  }

  return { ok: true };
}

function checkAndGetNonceKey(headerObj, rawHeader) {
  const { authorization } = headerObj.payload || {};
  if (!authorization) return null;
  // You can switch to authorization.nonce as key if desired
  return hashPaymentHeader(rawHeader);
}

async function callSettleOnChain(headerObj) {
  const { authorization, signature } = headerObj.payload;
  const provider = new ethers.JsonRpcProvider(FACILITATOR_CONFIG.rpcUrl);
  const wallet = new ethers.Wallet(FACILITATOR_CONFIG.privateKey, provider);

  const usdcAbi = [
    "function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s) external",
  ];

  const contract = new ethers.Contract(USDC_CONFIG.contract, usdcAbi, wallet);

  const sig = signature.startsWith("0x") ? signature.slice(2) : signature;
  const r = "0x" + sig.slice(0, 64);
  const s = "0x" + sig.slice(64, 128);
  const v = Number.parseInt(sig.slice(128, 130), 16);

  const tx = await contract.transferWithAuthorization(
    authorization.from,
    authorization.to,
    authorization.value,
    authorization.validAfter,
    authorization.validBefore,
    authorization.nonce,
    v,
    r,
    s,
  );

  const receipt = await tx.wait(1);
  return receipt.hash;
}

export function createFacilitatorApp() {
  const app = express();
  app.use(express.json());

  app.get("/supported", (req, res) => {
    res.json({
      x402Version: X402_VERSION,
      networks: [
        {
          id: BASE_NETWORK_ID,
          type: "evm",
          assets: [
            {
              symbol: USDC_CONFIG.symbol,
              contract: USDC_CONFIG.contract,
              decimals: USDC_CONFIG.decimals,
            },
          ],
          schemes: ["exact/erc3009"],
        },
      ],
    });
  });

  app.post("/verify", async (req, res) => {
    try {
      const { x402Version, paymentHeader, paymentRequirements } = req.body || {};
      if (x402Version !== X402_VERSION) {
        return res.status(400).json({ isValid: false, invalidReason: "unsupported_x402_version" });
      }
      const rawHeader = String(paymentHeader || "");
      const headerObj = decodeXPayment(rawHeader);

      const reasonReq = validatePaymentRequirements(headerObj, paymentRequirements || {});
      if (reasonReq) {
        return res.json({ isValid: false, invalidReason: reasonReq });
      }

      const sigResult = verifySignature(headerObj);
      if (!sigResult.ok) {
        return res.json({ isValid: false, invalidReason: sigResult.reason });
      }

      const nonceKey = checkAndGetNonceKey(headerObj, rawHeader);
      if (!nonceKey) {
        return res.json({ isValid: false, invalidReason: "missing_nonce" });
      }

      const state = authorizationState.get(nonceKey);
      if (state && state.status === "failed") {
        return res.json({ isValid: false, invalidReason: "nonce_failed" });
      }

      // If success or pending we treat as still valid (idempotent verify)
      return res.json({ isValid: true, invalidReason: null });
    } catch (e) {
      return res.status(500).json({ isValid: false, invalidReason: "internal_error" });
    }
  });

  app.post("/settle", async (req, res) => {
    try {
      const { x402Version, paymentHeader, paymentRequirements } = req.body || {};
      if (x402Version !== X402_VERSION) {
        return res.status(400).json({ success: false, error: "unsupported_x402_version" });
      }
      const rawHeader = String(paymentHeader || "");
      const headerObj = decodeXPayment(rawHeader);

      const reasonReq = validatePaymentRequirements(headerObj, paymentRequirements || {});
      if (reasonReq) {
        return res.json({ success: false, error: reasonReq });
      }

      const sigResult = verifySignature(headerObj);
      if (!sigResult.ok) {
        return res.json({ success: false, error: sigResult.reason });
      }

      const nonceKey = checkAndGetNonceKey(headerObj, rawHeader);
      if (!nonceKey) {
        return res.json({ success: false, error: "missing_nonce" });
      }

      const existing = authorizationState.get(nonceKey);
      if (existing) {
        if (existing.status === "success") {
          return res.json({
            success: true,
            transaction: existing.txHash,
            network: BASE_NETWORK_ID,
          });
        }
        if (existing.status === "pending") {
          return res.json({ success: false, error: "settlement_pending" });
        }
        if (existing.status === "failed") {
          return res.json({ success: false, error: "nonce_failed" });
        }
      }

      authorizationState.set(nonceKey, { status: "pending" });

      let txHash;
      try {
        txHash = await callSettleOnChain(headerObj);
      } catch (e) {
        authorizationState.set(nonceKey, { status: "failed" });
        return res.json({ success: false, error: "onchain_settle_failed" });
      }

      authorizationState.set(nonceKey, { status: "success", txHash });
      return res.json({ success: true, transaction: txHash, network: BASE_NETWORK_ID });
    } catch (e) {
      return res.status(500).json({ success: false, error: "internal_error" });
    }
  });

  return app;
}

export function startFacilitatorServer(port = 4000) {
  const app = createFacilitatorApp();
  app.listen(port, () => {
    console.log(`x402 facilitator listening on :${port}`);
  });
}
