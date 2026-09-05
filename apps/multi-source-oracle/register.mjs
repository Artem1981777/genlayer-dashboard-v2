// register.mjs — register the btc_usd feed on the deployed oracle.
//
// By default this script tunnels all RPC through the browser QUIC relay
// (rpc-relay.mjs) because the direct TCP path to the Bradbury RPC is broken
// by DPI. Pass --direct to use the plain network path instead.
//
// Usage (from apps/multi-source-oracle):
//   node --env-file=../../.env register.mjs          # via relay (default)
//   node --env-file=../../.env register.mjs --direct # without relay
import { readFileSync } from "node:fs";
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { installFetchRelay } from "./rpc-relay.mjs";
const PK = process.env.PRIVATE_KEY;
if(!PK){ throw new Error("PRIVATE_KEY missing. Run: node --env-file=../../.env register.mjs"); }
if(!process.argv.includes("--direct")){
  installFetchRelay();
  console.log("waiting 8s for the browser relay tab...");
  await new Promise(r=>setTimeout(r,8000));
}
const ADDR = (process.env.ORACLE || readFileSync("contract.txt","utf8")).trim();
const account = createAccount(PK);
const client = createClient({ chain: testnetBradbury, account });
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
function isTransient(e){ let m=""; try{ m=(e&&(e.shortMessage||e.message||""))+" "+(e&&e.details||""); }catch(x){ m=String(e);} return ["fetch failed","ECONNABORTED","ECONNRESET","capacity","-32005","timeout","socket","consensus contract","EVM tx"].some(s=>m.indexOf(s)>=0); }
async function robust(label,fn,tries){ const T=tries||60; for(let i=1;i<=T;i++){ try{ return await fn(); } catch(e){ if(isTransient(e)&&i<T){ console.log(label+" transient, retry "+i); await sleep(3500); continue; } throw e; } } }
const KEY="btc_usd";
const QUESTION="BTC/USD spot price, median across Coinbase, CoinGecko and Kraken";
const SOURCES=["https://api.coinbase.com/v2/prices/BTC-USD/spot","https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd","https://api.kraken.com/0/public/Ticker?pair=XBTUSD"];
const TOL=100, MAXSPREAD=500, DEC=2;
console.log("oracle:", ADDR);
const h = await robust("register submit", ()=>client.writeContract({ address: ADDR, functionName:"register_feed", args:[KEY, QUESTION, JSON.stringify(SOURCES), TOL, MAXSPREAD, DEC], value:0n }));
console.log("register tx:", h);
await robust("register wait", ()=>client.waitForTransactionReceipt({ hash:h, status:TransactionStatus.ACCEPTED, retries:300 }));
const st = await robust("read", ()=>client.readContract({ address:ADDR, functionName:"get_state", args:[] }));
console.log("feeds:", st.feeds);
console.log("Explorer tx: https://explorer-bradbury.genlayer.com/tx/"+h);
