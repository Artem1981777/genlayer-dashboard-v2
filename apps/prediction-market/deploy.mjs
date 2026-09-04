import { readFileSync, writeFileSync } from "node:fs";
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) { throw new Error("PRIVATE_KEY not found. Run: node --env-file=.env deploy.mjs"); }

const QUESTION = "According to the cited sources, has Ethereum completed 'The Merge' and now runs on Proof-of-Stake?";
const RULES = "Resolve YES if the evidence clearly states Ethereum completed The Merge and uses Proof-of-Stake. Resolve NO if it clearly states it has not. Otherwise UNRESOLVED.";
const SOURCE1 = "https://en.wikipedia.org/wiki/The_Merge";
const SOURCE2 = "https://en.wikipedia.org/wiki/Ethereum";
const SOURCE3 = "";
const MARKET_ID = "eth-merge-pos";
// Mandatory dispute window (reviewer point 2): 1 hour of disputable time between
// resolve() and settle(). Configurable per deployment, always non-zero.
const DISPUTE_WINDOW_SECONDS = Number(process.env.DISPUTE_WINDOW_SECONDS || 3600);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function retryMsOf(e) {
  const m = e && (e.code === -32005 ? e : (e.cause && e.cause.code === -32005 ? e.cause : null));
  if (!m) return 0;
  const d = m.data || (e.cause && e.cause.data);
  const ra = d && d.retryAfterMs;
  return ra && ra > 0 ? ra : 1500;
}
async function withRetry(label, fn) {
  for (let attempt = 1; attempt <= 8; attempt++) {
    try { return await fn(); }
    catch (e) {
      const wait = retryMsOf(e);
      if (wait > 0 && attempt < 8) {
        console.log(label + " throttled (-32005), retry " + attempt + " in " + wait + "ms");
        await sleep(wait + 500);
        continue;
      }
      throw e;
    }
  }
}

const source = readFileSync("contracts/prediction_market.py", "utf8");
const code = new TextEncoder().encode(source);
const account = createAccount(PRIVATE_KEY);
const client = createClient({ chain: testnetBradbury, account });

try { await client.initializeConsensusSmartContract(); console.log("consensus init ok"); }
catch (e) { console.log("consensus init skipped:", e && e.message ? e.message : String(e)); }

console.log("Deploying PredictionMarketResolver...");
const txHash = await withRetry("deploy", () => client.deployContract({ code, args: [QUESTION, RULES, SOURCE1, SOURCE2, SOURCE3, MARKET_ID, DISPUTE_WINDOW_SECONDS] }));
console.log("deploy tx:", txHash);
await client.waitForTransactionReceipt({ hash: txHash, status: TransactionStatus.ACCEPTED, retries: 300 });
const tx = await client.getTransaction({ hash: txHash });
const address = tx?.txDataDecoded?.contractAddress ?? tx?.recipient;
console.log("=== DEPLOY RESULT ===");
console.log("statusName:", tx?.statusName);
console.log("txExecutionResultName:", tx?.txExecutionResultName);
console.log("contract address:", address);
const ok = (tx?.txExecutionResultName === "FINISHED" || tx?.txExecutionResultName === "FINISHED_WITH_RETURN");
console.log(ok ? ">>> CLEAN DEPLOY OK" : ("!!! WARNING: execution not clean -> " + tx?.txExecutionResultName));
writeFileSync("contract.txt", String(address));
writeFileSync("deploy-tx.txt", String(txHash));
console.log("saved address -> contract.txt");
