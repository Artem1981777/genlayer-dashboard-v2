import { readFileSync } from "node:fs";
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const PK = process.env.PRIVATE_KEY;
if (!PK) { throw new Error("PRIVATE_KEY missing. Run: node --env-file=.env test-payable.mjs"); }
const source = readFileSync("contracts/prediction_market.py", "utf8");
const code = new TextEncoder().encode(source);
const QUESTION = "According to the cited sources, has Ethereum completed 'The Merge' and now runs on Proof-of-Stake?";
const RULES = "Resolve YES if the evidence clearly states Ethereum completed The Merge and uses Proof-of-Stake. Resolve NO if it clearly states it has not. Otherwise UNRESOLVED.";
const GOOD1 = "https://en.wikipedia.org/wiki/The_Merge";
const GOOD2 = "https://en.wikipedia.org/wiki/Ethereum";
const MARKET_ID = "eth-merge-gating-test";
const STAKE = 1000000000000000n;
// Short dispute window so the deterministic test can wait it out if needed.
const DISPUTE_WINDOW_SECONDS = Number(process.env.DISPUTE_WINDOW_SECONDS || 120);

const account = createAccount(PK);
const client = createClient({ chain: testnetBradbury, account });
const ME = String(account.address).toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
const pass = (n) => console.log("PASS -", n);
const fail = (n, extra) => { console.log("FAIL -", n, extra || ""); failed++; };
const isRevert = (r) => (r === "FINISHED_WITH_ERROR" || r === "REVERTED" || r === "SUBMIT_TIMEOUT");

function retryMsOf(e) {
  const c = e && (e.code === -32005 ? e : (e.cause && e.cause.code === -32005 ? e.cause : null));
  if (!c) return 0;
  const d = c.data || (e.cause && e.cause.data);
  const ra = d && d.retryAfterMs;
  return ra && ra > 0 ? ra : 2000;
}
function isTransient(e) {
  let m = "";
  try { m = (e && (e.shortMessage || e.message || "")) + " " + (e && e.details || ""); } catch (x) { m = String(e); }
  return m.indexOf("fetch failed") >= 0 || m.indexOf("ECONNABORTED") >= 0 || m.indexOf("ECONNRESET") >= 0 || m.indexOf("capacity") >= 0 || m.indexOf("-32005") >= 0 || m.indexOf("timeout") >= 0 || m.indexOf("socket") >= 0 || m.indexOf("consensus contract") >= 0 || m.indexOf("EVM tx") >= 0;
}
async function robust(label, fn, tries) {
  const T = tries || 60;
  for (let i = 1; i <= T; i++) {
    try { return await fn(); }
    catch (e) {
      if (isTransient(e) && i < T) { const w = retryMsOf(e) || 3000; console.log(label + " transient, retry " + i + " in " + w + "ms"); await sleep(w + 500); continue; }
      throw e;
    }
  }
}
const read = (addr) => robust("read", () => client.readContract({ address: addr, functionName: "get_state", args: [] }));

async function deploy() {
  const h = await robust("deploy", () => client.deployContract({ code, args: [QUESTION, RULES, GOOD1, GOOD2, "", MARKET_ID, DISPUTE_WINDOW_SECONDS] }));
  await robust("deploy-wait", () => client.waitForTransactionReceipt({ hash: h, status: TransactionStatus.ACCEPTED, retries: 300 }));
  const tx = await robust("deploy-tx", () => client.getTransaction({ hash: h }));
  const addr = tx?.txDataDecoded?.contractAddress ?? tx?.recipient;
  if (!addr || tx?.txExecutionResultName !== "FINISHED_WITH_RETURN") throw new Error("deploy failed: " + tx?.txExecutionResultName);
  return addr;
}
async function call(addr, fn, args, value) {
  let h = null;
  try { h = await robust(fn + " submit", () => client.writeContract({ address: addr, functionName: fn, args, value: value || 0n })); }
  catch (e) { return "REVERTED"; }
  if (!h) return "SUBMIT_TIMEOUT";
  console.log("EVIDENCE hash " + fn + " = " + h);
  try { await robust(fn + " wait", () => client.waitForTransactionReceipt({ hash: h, status: TransactionStatus.ACCEPTED, retries: 300 })); }
  catch (e) { return "REVERTED"; }
  for (let i = 0; i < 120; i++) {
    const tx = await robust(fn + " res", () => client.getTransaction({ hash: h }));
    const r = tx?.txExecutionResultName;
    if (r && r !== "NOT_VOTED") return r;
    await sleep(5000);
  }
  return "NOT_VOTED";
}
function myPos(s) {
  let p = {};
  try { p = JSON.parse(s.positions); } catch (x) { p = {}; }
  for (const k of Object.keys(p)) { if (k.toLowerCase() === ME) return p[k]; }
  return null;
}
function myClaim(s) {
  let c = {};
  try { c = JSON.parse(s.claims); } catch (x) { c = {}; }
  for (const k of Object.keys(c)) { if (k.toLowerCase() === ME) return c[k]; }
  return null;
}

console.log("### Deterministic payable + gating tests (no LLM) ###");
const c = await deploy();
console.log("market:", c);

console.log("### T1: stake with zero value reverts ###");
const t1 = await call(c, "stake", ["YES"], 0n);
isRevert(t1) ? pass("zero-value stake reverted") : fail("expected revert on zero-value stake", t1);

console.log("### T2: claim before settle reverts ###");
const t2 = await call(c, "claim", [], 0n);
isRevert(t2) ? pass("claim before settle reverted") : fail("expected revert on early claim", t2);

console.log("### T3: dispute before resolve reverts ###");
const t3 = await call(c, "dispute", ["too early"], 0n);
isRevert(t3) ? pass("dispute before resolve reverted") : fail("expected revert on early dispute", t3);

console.log("### T4: stake YES (positive value) records position + freezes sources ###");
const t4 = await call(c, "stake", ["YES"], STAKE);
let s4 = await read(c);
let p4 = myPos(s4);
for (let i = 0; i < 60 && !(!isRevert(t4) && Number(s4.yes_pool) === Number(STAKE) && p4 && Number(p4.YES) === Number(STAKE)); i++) { await sleep(5000); s4 = await read(c); p4 = myPos(s4); }
(!isRevert(t4) && Number(s4.yes_pool) === Number(STAKE) && p4 && Number(p4.YES) === Number(STAKE)) ? pass("payable stake recorded") : fail("stake not recorded", JSON.stringify({ t4, yes_pool: s4.yes_pool, p4 }));
const frozenOk4 = s4.sources_frozen === true && s4.staking_started === true && Number(s4.first_stake_time) > 0;
frozenOk4 ? pass("sources frozen at first stake") : fail("sources not frozen at first stake", JSON.stringify({ frozen: s4.sources_frozen, started: s4.staking_started, t: s4.first_stake_time }));
console.log("### T4b: add_source after freeze reverts ###");
const t4b = await call(c, "add_source", ["https://example.com/late"]);
isRevert(t4b) ? pass("add_source after freeze reverted") : fail("expected revert on add_source after freeze", t4b);

console.log("### T5: void (creator) open -> voided ###");
const t5 = await call(c, "void", [], 0n);
const s5 = await read(c);
(!isRevert(t5) && s5.status === "voided" && s5.void_reason === "creator_void") ? pass("void succeeded") : fail("void failed", JSON.stringify({ t5, status: s5.status, reason: s5.void_reason }));

console.log("### T6: refund returns stake 1:1 ###");
const t6 = await call(c, "refund", [], 0n);
const s6 = await read(c);
const cl6 = myClaim(s6);
(!isRevert(t6) && cl6 && cl6.claimed === true && Number(cl6.payout) === Number(STAKE)) ? pass("refund 1:1") : fail("refund failed", JSON.stringify({ t6, cl6 }));

console.log("### T7: second refund reverts (anti-double) ###");
const t7 = await call(c, "refund", [], 0n);
isRevert(t7) ? pass("double refund reverted") : fail("expected revert on double refund", t7);

console.log("### T8: void after voided reverts (status not open) ###");
const t8 = await call(c, "void", [], 0n);
isRevert(t8) ? pass("re-void reverted") : fail("expected revert on re-void", t8);

console.log("=====================================");
console.log(failed === 0 ? "ALL PAYABLE/GATING TESTS PASSED" : (failed + " TEST(S) FAILED"));
process.exitCode = failed === 0 ? 0 : 1;
