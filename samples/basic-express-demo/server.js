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

// TODO: 替换成你的 Algorand TestNet / LocalNet 节点配置
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

// 一个需要付费的接口
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