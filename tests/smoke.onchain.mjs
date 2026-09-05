import { createClient, createAccount } from "genlayer-js"
import { testnetBradbury } from "genlayer-js/chains"

const account = createAccount()
const client = createClient({ chain: testnetBradbury, account })

// Transient Bradbury RPC errors ("fetch failed", "terminated", capacity) are
// retried a few times before declaring a contract unreadable.
const RETRIABLE = ["-32005","capacity","rate limit","exceeds defined limit","consensus contract","evm tx","not_voted","timeout","fetch failed","terminated","unknown rpc error","network"]
const isRetriable = (e) => { const m = String((e && e.message) || e).toLowerCase(); return RETRIABLE.some(s => m.includes(s)) }

async function readState(name, address) {
  for (let i = 0; i < 40; i++) {
    try {
      const s = await client.readContract({ address, functionName: "get_state", args: [] })
      console.log(`OK ${name} ${address}`)
      console.log("   state:", JSON.stringify(s).slice(0, 240))
      return true
    } catch (e) {
      if (isRetriable(e) && i < 39) { await new Promise(r => setTimeout(r, 3000)); continue }
      console.log(`FAIL ${name} ${address}: ${String((e && e.message) || e).slice(0, 160)}`)
      return false
    }
  }
  return false
}

const CM = "0x235F51b11b9F96d6673df37553Ef58373c4324F9"
const PM = "0x3d17bD6d87563cB172E7C634341fBc8A14574035"
const ORACLE = "0x2Ab508Bb9Be84ea4ea8388b9b8872017729a2C82"
let ok = true
ok = (await readState("Content Moderator", CM)) && ok
ok = (await readState("Prediction Market", PM)) && ok
ok = (await readState("Multi-Source Oracle", ORACLE)) && ok
console.log(ok ? "SMOKE PASS" : "SMOKE FAIL")
process.exit(ok ? 0 : 1)
