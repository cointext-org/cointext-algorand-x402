import algosdk from "algosdk";

const AUTH_PREFIX = "ALGOX402-AUTH-1|";

function encodeAuthorizationForSigning(auth) {
  const ordered = {
    payer: auth.payer,
    seller: auth.seller,
    assetId: Number(auth.assetId ?? 0),
    amount: String(auth.amount),
    validAfter: String(auth.validAfter),
    validBefore: String(auth.validBefore),
    nonce: String(auth.nonce),
    resource: String(auth.resource || ""),
  };
  const json = JSON.stringify(ordered);
  const prefixBytes = new TextEncoder().encode(AUTH_PREFIX);
  const jsonBytes = new TextEncoder().encode(json);

  const out = new Uint8Array(prefixBytes.length + jsonBytes.length);
  out.set(prefixBytes, 0);
  out.set(jsonBytes, prefixBytes.length);
  return out;
}

export function signAuthorizationWithAccount(account, authorization) {
  const msg = encodeAuthorizationForSigning(authorization);
  const sig = algosdk.signBytes(msg, account.sk);
  return Buffer.from(sig).toString("base64");
}

export function verifyAuthorizationSignature(address, authorization, signatureB64) {
  const msg = encodeAuthorizationForSigning(authorization);
  const sig = Buffer.from(signatureB64, "base64");
  const pk = algosdk.decodeAddress(address).publicKey;
  return algosdk.verifyBytes(msg, sig, pk);
}

export function decodeXPayment(raw) {
  let jsonStr = String(raw || "").trim();
  if (!jsonStr) throw new Error("empty_x_payment");
  if (!jsonStr.startsWith("{")) {
    jsonStr = Buffer.from(jsonStr, "base64").toString("utf8");
  }
  return JSON.parse(jsonStr);
}

export function extractAuthorizationFromHeaderObj(headerObj) {
  const payload = headerObj && headerObj.payload;
  if (!payload) return null;
  const { authorization, signature } = payload;
  if (!authorization || !signature) return null;
  return { authorization, signature };
}
