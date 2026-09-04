import { readFileSync } from "node:fs";
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
const PK = process.env.PRIVATE_KEY;
if (!PK) { throw new Error("PRIVATE_KEY missing. Run: node --env-file=.env test.mjs"); }
const source = readFileSync("contracts/prediction_market.py", "utf8");
const code = new TextEncoder().encode(source);
const QUESTION = "According to the cited sources, has Ethereum completed 'The Merge' and now runs on Proof-of-Stake?";
const RULES = "Resolve YES if the evidence clearly states Ethereum completed The Merge and uses Proof-of-Stake. Resolve NO if it clearly states it has not. Otherwise UNRESOLVED.";
const GOOD1 = "https://en.wikipedia.org/wiki/The_Merge";
const GOOD2 = "https://en.wikipedia.org/wiki/Ethereum";
const STAKE = 1000000000000000n;
// Short dispute window so the full lifecycle test can wait it out on-chain.
const DISPUTE_WINDOW_SECONDS = Number(process.env.DISPUTE_WINDOW_SECONDS || 120);
const account = createAccount(PK);
const client = createClient({ chain: testnetBradbury, account });
const ME = String(account.address).toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const pass = (n) => console.log("PASS -", n);
const fail = (n, extra) => { console.log("FAIL -", n, extra ?? ""); failed++; };
const isRevert = (r) => (r === "FINISHED_WITH_ERROR" || r === "REVERTED" || r === "SUBMIT_TIMEOUT");
function isTransient(e){ let m=""; try{ m=(e&&(e.shortMessage||e.message||""))+" "+(e&&e.details||""); }catch(x){ m=String(e);} return ["fetch failed","ECONNABORTED","ECONNRESET","capacity","-32005","timeout","socket","consensus contract","EVM tx"].some(s=>m.indexOf(s)>=0); }
async function robust(label,fn,tries){ const T=tries||60; for(let i=1;i<=T;i++){ try{ return await fn(); } catch(e){ if(isTransient(e)&&i<T){ console.log(label+" transient, retry "+i); await sleep(3500); continue; } throw e; } } }
const read = (addr) => robust("read", () => client.readContract({ address: addr, functionName: "get_state", args: [] }));
async function deploy(s1,s2,s3,marketId){
  const h = await robust("deploy", () => client.deployContract({ code, args: [QUESTION, RULES, s1, s2, s3, marketId, DISPUTE_WINDOW_SECONDS] }));
  await robust("deploy-wait", () => client.waitForTransactionReceipt({ hash: h, status: TransactionStatus.ACCEPTED, retries: 300 }));
  const tx = await robust("deploy-tx", () => client.getTransaction({ hash: h }));
  const addr = tx?.txDataDecoded?.contractAddress ?? tx?.recipient;
  if (!addr || tx?.txExecutionResultName !== "FINISHED_WITH_RETURN") throw new Error("deploy failed: " + tx?.txExecutionResultName);
  return addr;
}
async function call(addr, fn, args, value){
  let h = null;
  try { h = await robust(fn + " submit", () => client.writeContract({ address: addr, functionName: fn, args, value: value || 0n })); }
  catch (e) { return "REVERTED"; }
  if (!h) return "SUBMIT_TIMEOUT";
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
async function waitLeaves(addr, fromStatus){ let s; for(let i=0;i<220;i++){ s=await read(addr); if(s?.status!==fromStatus) return s; await sleep(5000);} return s; }
function myPos(s){ let p={}; try{ p=JSON.parse(s.positions);}catch(x){} for(const k of Object.keys(p)){ if(k.toLowerCase()===ME) return p[k]; } return null; }
function myClaim(s){ let c={}; try{ c=JSON.parse(s.claims);}catch(x){} for(const k of Object.keys(c)){ if(k.toLowerCase()===ME) return c[k]; } return null; }
console.log("### Full AI lifecycle: stake -> freeze -> resolve -> dispute_window -> dispute -> resolve_dispute -> wait window -> settle -> claim ###");
const c1 = await deploy(GOOD1, GOOD2, "", "eth-merge-lifecycle");
console.log("market:", c1);
console.log("### T1: stake YES records position + freezes sources/config ###");
const t1 = await call(c1, "stake", ["YES"], STAKE);
const s1 = await read(c1);
const p1 = myPos(s1);
let frozenList = [];
try { frozenList = JSON.parse(s1?.frozen_sources || "[]"); } catch (x) { frozenList = []; }
const frozenOk = s1?.sources_frozen === true && s1?.staking_started === true && Number(s1?.first_stake_time) > 0 && frozenList.length === 2 && typeof s1?.frozen_config_hash === "string" && s1.frozen_config_hash.length > 0;
(!isRevert(t1) && p1 && Number(p1.YES) === Number(STAKE) && frozenOk) ? pass("stake recorded + sources frozen on-chain") : fail("stake/freeze failed", JSON.stringify({ t1, p1, frozen: s1?.sources_frozen, fs: s1?.frozen_sources }));
console.log("### T2: add_source after freeze reverts ###");
const t2 = await call(c1, "add_source", ["https://example.com/late-source"]);
isRevert(t2) ? pass("add_source after freeze reverted") : fail("expected revert on add_source after freeze", t2);
console.log("### T3: resolve -> dispute_window YES ###");
const t3 = await call(c1, "resolve", []);
const s3 = await waitLeaves(c1, "open");
(!isRevert(t3) && s3?.status === "dispute_window" && s3?.outcome === "YES" && Number(s3?.resolve_time) > 0 && Number(s3?.dispute_deadline) === Number(s3?.resolve_time) + DISPUTE_WINDOW_SECONDS) ? pass("resolved YES into dispute_window") : fail("expected dispute_window YES", JSON.stringify({ t3, status: s3?.status, outcome: s3?.outcome, rt: s3?.resolve_time, dl: s3?.dispute_deadline }));
console.log("### T4: settle during dispute window reverts ###");
const t4 = await call(c1, "settle", []);
isRevert(t4) ? pass("settle during dispute window reverted") : fail("expected revert on settle during window", t4);
console.log("### T5: participant dispute during window -> disputed ###");
const t5 = await call(c1, "dispute", ["Please re-check the cited sources before settlement."]);
const s5 = await waitLeaves(c1, "dispute_window");
(!isRevert(t5) && s5?.status === "disputed") ? pass("disputed") : fail("dispute failed", JSON.stringify({ t5, status: s5?.status }));
console.log("### T6: resolve_dispute -> dispute_resolved (fresh window) ###");
const t6 = await call(c1, "resolve_dispute", []);
const s6 = await waitLeaves(c1, "disputed");
(!isRevert(t6) && s6?.status === "dispute_resolved" && Number(s6?.dispute_deadline) > 0) ? pass("dispute resolved (outcome=" + (s6?.dispute_outcome ?? "?") + ")") : fail("resolve_dispute failed", JSON.stringify({ t6, status: s6?.status }));
console.log("### T7: wait for dispute window to close, then settle -> settled ###");
let s7 = await read(c1);
for (let i = 0; i < 240 && Number(s7?.dispute_deadline) + 10 > Math.floor(Date.now() / 1000); i++) { await sleep(5000); s7 = await read(c1); }
const t7 = await call(c1, "settle", []);
const s7b = await read(c1);
(!isRevert(t7) && s7b?.status === "settled" && s7b?.winning_side === "YES") ? pass("settled after window closed") : fail("settle failed", JSON.stringify({ t7, status: s7b?.status, win: s7b?.winning_side }));
console.log("### T8: claim -> payout, claimed ###");
const t8 = await call(c1, "claim", [], 0n);
const s8 = await read(c1);
const cl8 = myClaim(s8);
(!isRevert(t8) && cl8 && cl8.claimed === true && Number(cl8.payout) > 0) ? pass("claim paid (" + (cl8 && cl8.payout) + ")") : fail("claim failed", JSON.stringify({ t8, cl8 }));
console.log("### T9: double claim reverts ###");
const t9 = await call(c1, "claim", [], 0n);
isRevert(t9) ? pass("double claim reverted") : fail("expected revert on double claim", t9);
console.log("### Recovery market: nobody backed the winning side ###");
const c2 = await deploy(GOOD1, GOOD2, "", "eth-merge-recovery");
console.log("### T10: stake NO only (YES side stays empty) ###");
const t10 = await call(c2, "stake", ["NO"], STAKE);
const s10 = await read(c2);
(!isRevert(t10) && Number(s10?.no_pool) === Number(STAKE) && Number(s10?.yes_pool) === 0) ? pass("NO stake recorded, YES pool empty") : fail("NO stake failed", JSON.stringify({ t10, no: s10?.no_pool, yes: s10?.yes_pool }));
console.log("### T11: resolve -> dispute_window YES (winning side empty) ###");
const t11 = await call(c2, "resolve", []);
const s11 = await waitLeaves(c2, "open");
(!isRevert(t11) && s11?.status === "dispute_window" && s11?.outcome === "YES") ? pass("resolved YES") : fail("expected dispute_window YES", JSON.stringify({ t11, status: s11?.status, outcome: s11?.outcome }));
console.log("### T12: wait window, settle -> auto-VOID because winning side is empty ###");
let s12 = await read(c2);
for (let i = 0; i < 240 && Number(s12?.dispute_deadline) + 10 > Math.floor(Date.now() / 1000); i++) { await sleep(5000); s12 = await read(c2); }
const t12 = await call(c2, "settle", []);
const s12b = await read(c2);
(!isRevert(t12) && s12b?.status === "voided" && s12b?.void_reason === "winning_side_empty") ? pass("auto-void on empty winning side") : fail("expected auto-void", JSON.stringify({ t12, status: s12b?.status, reason: s12b?.void_reason }));
console.log("### T13: refund after auto-void returns stake 1:1 ###");
const t13 = await call(c2, "refund", [], 0n);
const s13 = await read(c2);
const cl13 = myClaim(s13);
(!isRevert(t13) && cl13 && cl13.claimed === true && Number(cl13.payout) === Number(STAKE)) ? pass("refund 1:1 after auto-void") : fail("refund failed", JSON.stringify({ t13, cl13 }));
console.log("### Gating market ###");
const c3 = await deploy(GOOD1, "", "", "eth-merge-gating");
console.log("### T14: zero-value stake reverts ###");
const t14 = await call(c3, "stake", ["YES"], 0n);
isRevert(t14) ? pass("zero-value stake reverted") : fail("expected revert on zero-value stake", t14);
console.log("### T15: claim before settle reverts ###");
const t15 = await call(c3, "claim", [], 0n);
isRevert(t15) ? pass("early claim reverted") : fail("expected revert on early claim", t15);
console.log("### T16: dispute before resolve reverts ###");
const t16 = await call(c3, "dispute", ["too early"], 0n);
isRevert(t16) ? pass("early dispute reverted") : fail("expected revert on early dispute", t16);
console.log("### T17: non-participant dispute reverts (resolved, never staked) ###");
const t17r = await call(c3, "resolve", []);
const s17 = await waitLeaves(c3, "open");
const okResolved = s17?.status === "dispute_window";
const t17 = okResolved ? await call(c3, "dispute", ["I did not stake but want to dispute."]) : "SKIP";
(okResolved && isRevert(t17)) ? pass("non-participant dispute reverted") : fail("expected revert on non-participant dispute", JSON.stringify({ t17r, status: s17?.status, t17 }));
console.log("### T18: empty dispute reason reverts ###");
const t18 = okResolved ? await call(c3, "dispute", ["   "]) : "SKIP";
(okResolved && isRevert(t18)) ? pass("empty dispute reason reverted") : fail("expected revert on empty reason", t18);
console.log("### T19: resolve without source reverts ###");
const c4 = await deploy("", "", "", "eth-merge-nosource");
const t19 = await call(c4, "resolve", []);
isRevert(t19) ? pass("resolve without source reverted") : fail("expected revert without source", t19);
console.log("### T20: non-http source rejected ###");
const t20 = await call(c4, "add_source", ["ftp://evil.example/x"]);
isRevert(t20) ? pass("non-http source rejected") : fail("expected revert on bad URL", t20);
console.log("=====================================");
console.log(failed === 0 ? "ALL PM LIFECYCLE/GATING TESTS PASSED" : (failed + " TEST(S) FAILED"));
process.exitCode = failed === 0 ? 0 : 1;
