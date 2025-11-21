import express from "express";
import dotenv from "dotenv";
import { avmPaymentMiddleware } from "../../src/avm402/seller/paymentMiddleware.js";

dotenv.config();

const app = express();
app.use(express.json());

// 纯 AVM x402 示例：Seller 只关心自己的地址和 facilitator URL，
// 所有链上交互都由 facilitator 负责。

// TODO: 替换成你的 Seller 地址（要在 Algorand 网络上存在且有余额）
const SELLER_ADDRESS = process.env.SELLER_ADDRESS;

// Facilitator 服务地址
const FACILITATOR_BASE = process.env.AVM_FACILITATOR_URL || "http://localhost:4100";

app.get(
  "/protected-avm",
  avmPaymentMiddleware(
    SELLER_ADDRESS,
    {
      maxAmountRequired: "1000000", // 0.001 ALGO
      assetId: Number(process.env.DEFAULT_ASSET_ID || 0),
      maxTimeoutSeconds: 60,
      network: process.env.ALGORAND_NETWORK || "algorand-testnet",
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

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`AVM x402 seller listening on http://localhost:${PORT}`);
  console.log(`Try: curl http://localhost:${PORT}/protected-avm`);
});