import algosdk from "algosdk";
import {
  AlgorandConfig,
  AlgorandClient,
  Algox402Buyer,
} from "../../src/index.js";
import dotenv from 'dotenv'
dotenv.config()

// TODO: 替换成你的 Algorand 节点 + Buyer 账户 mnemonic
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

// Buyer 账户
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