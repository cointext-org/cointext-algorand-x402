# Algox402 — Algorand x402 Payment Protocol SDK

A secure, verifiable pay-per-request access protocol built on the Algorand blockchain.  
Supports **Buyer**, **Seller**, **Facilitator**, **Express middleware**, and **Postgres storage**.

---

## Overview

- What is Algox402?
- Motivation & design goals  
- Key features summary  
- Supported roles (Buyer / Seller / Facilitator)  
- High-level workflow diagram (optional placeholder)

---

## Installation

```bash
npm install algox402-algorand-sdk
```

## Usage

### 1. Basic on-chain payment (existing demo)

#### buyer
```js
import algosdk from "algosdk";
import {
  AlgorandConfig,
  AlgorandClient,
  Algox402Buyer,
} from "algox402-algorand-sdk";
import dotenv from 'dotenv'
dotenv.config()

// TODO: replace with your Algorand TestNet / LocalNet node config
const cfg = new AlgorandConfig({
  algodToken:
    process.env.ALGOD_TOKEN ||
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  algodServer: process.env.ALGOD_SERVER || "http://localhost",
  algodPort: Number(process.env.ALGOD_PORT) || 4001,
  indexerToken:
    process.env.INDEXER_TOKEN ||
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  indexerServer: process.env.INDEXER_SERVER || "http://localhost",
  indexerPort: Number(process.env.INDEXER_PORT) || 8980,
  network: process.env.ALGORAND_NETWORK || "algorand-testnet",
  defaultAssetId: Number(process.env.DEFAULT_ASSET_ID) || 0,
});

const algoClient = new AlgorandClient(cfg);

// TODO: replace with your Buyer account mnemonic
const BUYER_MNEMONIC = process.env.BUYER_MNEMONIC
const buyerAccount = algosdk.mnemonicToSecretKey(BUYER_MNEMONIC);

async function main() {
  const buyer = new Algox402Buyer(algoClient, buyerAccount);

  const url = "http://localhost:3000/protected";
  console.log("Requesting:", url);

  const resp = await buyer.request("GET", url);
  console.log("Status:", resp.status);
  const data = await resp.json();
  console.log("Body:", data);
}

main().catch((e) => {
  console.error("Buyer error:", e);
  process.exit(1);
});
```

#### seller
```js
import express from "express";
import {
  AlgorandConfig,
  AlgorandClient,
  SimplePricing,
  PaymentVerifier,
  createAlgox402Middleware,
} from "algox402-algorand-sdk";

const app = express();
app.use(express.json());

// TODO: replace with your Algorand TestNet / LocalNet node config
const cfg = new AlgorandConfig({
  algodToken: process.env.ALGOD_TOKEN || "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  algodServer: process.env.ALGOD_SERVER || "http://localhost",
  algodPort: Number(process.env.ALGOD_PORT) || 4001,
  indexerToken: process.env.INDEXER_TOKEN || "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  indexerServer: process.env.INDEXER_SERVER || "http://localhost",
  indexerPort: Number(process.env.INDEXER_PORT) || 8980,
  network: process.env.ALGORAND_NETWORK || "algorand-testnet",
  defaultAssetId: Number(process.env.DEFAULT_ASSET_ID) || 0,
});

const algoClient = new AlgorandClient(cfg);

// TODO: replace with your Seller address (must exist on the above node and have balance)
const SELLER_ADDRESS = "LMM5UCI5W5DNFX52V2KRSPKSW2YWCMWDXKCFUGYEVTBYD7THBTEBIFNNVE";

const pricing = new SimplePricing({
  sellerAddress: SELLER_ADDRESS,
  chain: cfg.network,
  assetId: cfg.defaultAssetId,
  basePrice: 1000, // 1000 microAlgo = 0.001 ALGO
});

const verifier = new PaymentVerifier(algoClient);
const paywall = createAlgox402Middleware({ pricing, verifier });

// a protected endpoint
app.get("/protected", paywall, (req, res) => {
  res.json({
    ok: true,
    message: "You have successfully paid on Algorand and accessed the resource!",
    timestamp: new Date().toISOString(),
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Seller server listening on http://localhost:${PORT}`);
  console.log(`Try: curl http://localhost:${PORT}/protected`);
});
```

---

### 2. AVM x402 with X-PAYMENT header (authorization-based)

This mode uses an off-chain Algorand authorization (Ed25519 signature over a structured payload) carried in an `X-PAYMENT` header, and a facilitator service that verifies and settles payments on-chain before the seller releases the resource.

#### Facilitator (Algorand)

```js
// src/avm402/server.js
import { startAvmFacilitatorServer } from "./facilitator.js";

startAvmFacilitatorServer(4100);
```

Required env vars:

- `ALGOD_*` / `INDEXER_*` / `ALGORAND_NETWORK` / `ALGORAND_DEFAULT_ASSET_ID`
- `FACILITATOR_MNEMONIC` – account that will actually send ALGO/ASA to the seller

#### Seller middleware (Express)

```js
import express from "express";
import dotenv from "dotenv";
import { avmPaymentMiddleware } from "./src/avm402/seller/paymentMiddleware.js";

dotenv.config();

const app = express();
app.use(express.json());

const SELLER_ADDRESS = process.env.SELLER_ADDRESS; // Algorand address
const FACILITATOR_BASE = process.env.AVM_FACILITATOR_URL || "http://localhost:4100";

app.get(
  "/protected-avm",
  avmPaymentMiddleware(
    SELLER_ADDRESS,
    {
      maxAmountRequired: "1000000", // 1000 microAlgo or ASA units
      assetId: 0,                    // 0 = ALGO
      maxTimeoutSeconds: 60,
      network: "algorand-testnet",
    },
    { baseUrl: FACILITATOR_BASE },
  ),
  (req, res) => {
    res.json({
      ok: true,
      mode: "avm-x402",
      message: "Paid via AVM x402 (authorization + facilitator settle)",
      timestamp: new Date().toISOString(),
    });
  },
);

app.listen(3000, () => {
  console.log("Seller listening on http://localhost:3000");
  console.log("Try: curl http://localhost:3000/protected-avm");
});
```

#### Buyer (AVM x402)

```js
import algosdk from "algosdk";
import fetch from "node-fetch";
import dotenv from "dotenv";
import {
  generateAuthorization,
  signAuthorization,
  createXPaymentHeader,
} from "./src/avm402/buyer/sdk.js";

dotenv.config();

const BUYER_MNEMONIC = process.env.BUYER_MNEMONIC;
const buyerAccount = algosdk.mnemonicToSecretKey(BUYER_MNEMONIC);

async function main() {
  const resource = "http://localhost:3000/protected-avm";

  // 1) First request, expect 402 with `accepts` description
  let resp = await fetch(resource);
  console.log("First request status:", resp.status);
  const body = await resp.json();
  console.log("402 body:", body);

  const accept = body.accepts[0];

  // 2) Build authorization + signature
  const authorization = generateAuthorization(
    buyerAccount.addr,
    accept.payTo,
    accept.assetId,
    accept.maxAmountRequired,
    accept.resource,
  );
  const signature = signAuthorization(buyerAccount, authorization);
  const xPayment = createXPaymentHeader(authorization, signature, accept.network);

  // 3) Second request with X-PAYMENT header
  resp = await fetch(resource, {
    headers: {
      "X-PAYMENT": xPayment,
    },
  });

  console.log("Second request status:", resp.status);
  console.log("X-PAYMENT-RESPONSE:", resp.headers.get("x-payment-response"));
  const data = await resp.json();
  console.log("Body:", data);
}

main().catch((e) => {
  console.error("AVM Buyer error:", e);
  process.exit(1);
});
```
