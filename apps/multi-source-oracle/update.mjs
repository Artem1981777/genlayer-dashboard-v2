// update.mjs — run update(key) on the deployed oracle.
//
// By default this script tunnels all RPC through the browser QUIC relay
// (rpc-relay.mjs) because the direct TCP path to the Bradbury RPC is broken
// by DPI. Pass --direct to use the plain network path instead.
//
// Usage (from apps/multi-source-oracle):
//   node --env-file=../../.env update.mjs          # via relay (default)
//   node --env-file=../../.env update.mjs --direct # without relay
import { readFileSync } from "node:fs";
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { installFetchRelay } from "./rpc-relay.mjs";
const PK = process.env.PRIVATE_KEY;
if(!PK){ throw new Error("PRIVATE_KEY missing. Run: node --env-file=../../.env update.mjs"); }
if(!process.argv.includes("--direct")){
  installFetchRelay();
  console.log("waiting 8s for the browser relay tab...");
  await new Promise(r=>setTimeout(r,8000));
}
const ADDR = (process.env.ORACLE || readFileSync("contract.txt","utf8")).trim();
const KEY = process.env.FEED || "btc_usd";
const account = createAccount(PK);
const client = createClient({ chain: testnetBradbury, account });
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
function isTransient(e){ let m=""; try{ m=(e&&(e.shortMessage||e.message||""))+" "+(e&&e.details||""); }catch(x){ m=String(e);} return ["fetch failed","ECONNABORTED","ECONNRESET","capacity","-32005","timeout","socket","consensus contract","EVM tx","NOT_VOTED"].some(s=>m.indexOf(s)>=0); }
async function robust(label,fn,tries){ const T=tries||80; for(let i=1;i<=T;i++){ try{ return await fn(); } catch(e){ if(isTransient(e)&&i<T){ console.log(label+" transient, retry "+i); await sleep(4000); continue; } throw e; } } }
console.log("oracle:", ADDR, "feed:", KEY);
let h=null;
try { h = await robust("update submit", ()=>client.writeContract({ address:ADDR, functionName:"update", args:[KEY], value:0n })); }
catch(e){ console.log("update submit failed:", e&&e.message?e.message:String(e)); process.exit(1); }
console.log("update tx:", h);
try { await robust("update wait", ()=>client.waitForTransactionReceipt({ hash:h, status:TransactionStatus.ACCEPTED, retries:300 })); } catch(e){ console.log("wait note:", e&&e.message?e.message:String(e)); }
let res="";
for(let i=0;i<120;i++){ const tx=await robust("res",()=>client.getTransaction({hash:h})); res=tx?.txExecutionResultName||""; if(res&&res!=="NOT_VOTED") break; await sleep(5000); }
console.log("exec:", res);
const st = await robust("read", ()=>client.readContract({ address:ADDR, functionName:"get_state", args:[] }));
let vals={}; try{ vals=JSON.parse(st.values);}catch(x){}
console.log("value:", JSON.stringify(vals[KEY]||{}, null, 2));
console.log("Explorer tx: https://explorer-bradbury.genlayer.com/tx/"+h);
