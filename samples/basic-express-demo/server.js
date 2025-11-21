import express from "express";
import {
  AlgorandConfig,
  AlgorandClient,
  SimplePricing,
  PaymentVerifier,
  createAlgox402Middleware,
} from "../../src/index.js";
import { avmPaymentMiddleware } from "../../src/avm402/seller/paymentMiddleware.js";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());

// TODO: 替换成你的 Algorand TestNet / LocalNet 节点配置
const cfg = new AlgorandConfig({
  algodToken: process.env.ALGOD_TOKEN || "",
  algodServer: process.env.ALGOD_SERVER || "http://localhost",
  algodPort: Number(process.env.ALGOD_PORT) || 4001,
  indexerToken: process.env.INDEXER_TOKEN || "",
  indexerServer: process.env.INDEXER_SERVER || "http://localhost",
  indexerPort: Number(process.env.INDEXER_PORT) || 8980,
  network: process.env.ALGORAND_NETWORK || "algorand-testnet",
  defaultAssetId: Number(process.env.DEFAULT_ASSET_ID) || 0,
});

const algoClient = new AlgorandClient(cfg);

// TODO: 替换成你的 Seller 地址（要在上面节点上存在且有余额）
const SELLER_ADDRESS = process.env.SELLER_ADDRESS;

const pricing = new SimplePricing({
  sellerAddress: SELLER_ADDRESS,
  chain: cfg.network,
  assetId: cfg.defaultAssetId,
  basePrice: 1000, // 1000 microAlgo = 0.001 ALGO
});

const verifier = new PaymentVerifier(algoClient);
const paywall = createAlgox402Middleware({ pricing, verifier });

// 1) 一个直接基于链上支付 txid 的示例接口
app.get("/protected", paywall, (req, res) => {
  res.json({
    ok: true,
    message: "You have successfully paid on Algorand and accessed the resource!",
    timestamp: new Date().toISOString(),
  });
});

// 2) 使用 AVM x402 (X-PAYMENT + facilitator) 的示例接口
const FACILITATOR_BASE = process.env.AVM_FACILITATOR_URL || "http://localhost:4100";

app.get(
  "/protected-avm",
  avmPaymentMiddleware(
    SELLER_ADDRESS,
    {
      maxAmountRequired: "1000000", // 0.001 ALGO
      assetId: cfg.defaultAssetId,
      maxTimeoutSeconds: 60,
      network: cfg.network,
    },
    { baseUrl: FACILITATOR_BASE },
  ),
  (req, res) => {
    res.json({
      ok: true,
      mode: "avm-x402",
      message: "You have successfully paid via AVM x402 and accessed the resource!",
      timestamp: new Date().toISOString(),
    });
  },
);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Seller server listening on http://localhost:${PORT}`);
  console.log(`Try: curl http://localhost:${PORT}/protected`);
  console.log(`Try: curl http://localhost:${PORT}/protected-avm`);
});