import algosdk from "algosdk";
import fetch from "node-fetch";
import dotenv from "dotenv";
import {
  generateAuthorization,
  signAuthorization,
  createXPaymentHeader,
} from "../../src/avm402/buyer/sdk.js";

dotenv.config();

// Buyer 账户
const BUYER_MNEMONIC = process.env.BUYER_MNEMONIC;
const buyerAccount = algosdk.mnemonicToSecretKey(BUYER_MNEMONIC);

async function main() {
  const resource = "http://localhost:3000/protected-avm";

  // 第一次请求，预期收到 402 + accepts
  let resp = await fetch(resource);
  console.log("First request status:", resp.status);
  const body = await resp.json();
  console.log("402 body:", body);

  const accept = body.accepts[0];

  const authorization = generateAuthorization(
    buyerAccount.addr,
    accept.payTo,
    accept.assetId,
    accept.maxAmountRequired,
    accept.resource,
  );
  const signature = signAuthorization(buyerAccount, authorization);
  const xPayment = createXPaymentHeader(authorization, signature, accept.network);

  // 带 X-PAYMENT header 的第二次请求
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
  console.error("AVM buyer error:", e);
  process.exit(1);
});