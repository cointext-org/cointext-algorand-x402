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

### buyer
```js
import algosdk from "algosdk";
import {
  AlgorandConfig,
  AlgorandClient,
  Algox402Buyer,
} from "../../src/index.js";
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

### seller
```js
import express from "express";
import {
  AlgorandConfig,
  AlgorandClient,
  SimplePricing,
  PaymentVerifier,
  createAlgox402Middleware,
} from "../../src/index.js";

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
