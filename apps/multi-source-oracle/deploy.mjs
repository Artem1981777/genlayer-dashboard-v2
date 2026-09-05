import { readFileSync, writeFileSync } from "node:fs";
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) { throw new Error("PRIVATE_KEY not found. Run from apps/multi-source-oracle: node --env-file=../../.env deploy.mjs"); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function retryMsOf(e){ const m = e && (e.code===-32005?e:(e.cause&&e.cause.code===-32005?e.cause:null)); if(!m) return 0; const d=m.data||(e.cause&&e.cause.data); const ra=d&&d.retryAfterMs; return ra&&ra>0?ra:1500; }
function isTransient(e){ let m=""; try{ m=(e&&(e.shortMessage||e.message||""))+" "+(e&&e.details||"")+" "+((e&&e.cause&&e.cause.code)||""); }catch(x){ m=String(e);} return ["fetch failed","ECONNABORTED","ECONNRESET","capacity","-32005","timeout","socket","terminated","ECONNRESET"].some(s=>m.indexOf(s)>=0); }
async function withRetry(label, fn, tries){ const T=tries||25; for(let a=1;a<=T;a++){ try{ return await fn(); } catch(e){ const w=retryMsOf(e); if((w>0||isTransient(e))&&a<T){ console.log(label+" transient ("+String(e&&e.details||e&&e.shortMessage||e).slice(0,60)+"), retry "+a+" of "+T); await sleep(w>0?w+500:5000); continue; } throw e; } } }
const source = readFileSync("contracts/oracle.py","utf8");
const code = new TextEncoder().encode(source);
const account = createAccount(PRIVATE_KEY);
const client = createClient({ chain: testnetBradbury, account });
try { await client.initializeConsensusSmartContract(); console.log("consensus init ok"); } catch(e){ console.log("consensus init skipped:", e&&e.message?e.message:String(e)); }
console.log("Deploying MultiSourceOracle...");
const txHash = await withRetry("deploy submit", () => client.deployContract({ code, args: [] }));
console.log("deploy tx:", txHash);
await withRetry("deploy wait", () => client.waitForTransactionReceipt({ hash: txHash, status: TransactionStatus.ACCEPTED, retries: 300 }));
const tx = await withRetry("deploy read", () => client.getTransaction({ hash: txHash }));
const address = tx?.txDataDecoded?.contractAddress ?? tx?.recipient;
console.log("=== DEPLOY RESULT ===");
console.log("statusName:", tx?.statusName);
console.log("txExecutionResultName:", tx?.txExecutionResultName);
console.log("contract address:", address);
const ok = (tx?.txExecutionResultName==="FINISHED"||tx?.txExecutionResultName==="FINISHED_WITH_RETURN");
console.log(ok?">>> CLEAN DEPLOY OK":("!!! WARNING: execution not clean -> "+tx?.txExecutionResultName));
writeFileSync("contract.txt", String(address));
writeFileSync("deploy-tx.txt", String(txHash));
console.log("saved address -> contract.txt");
console.log("Explorer: https://explorer-bradbury.genlayer.com/address/"+String(address));
