import algosdk from "algosdk";
const account = algosdk.generateAccount();
console.log(algosdk.secretKeyToMnemonic(account.sk));