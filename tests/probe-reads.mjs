// Diagnostic: read get_state from all three deployed contracts with retries.
import { createClient, createAccount } from "genlayer-js"
import { testnetBradbury } from "genlayer-js/chains"

const client = createClient({ chain: testnetBradbury, account: createAccount() })

const TARGETS = [
  ["Content Moderator", "0x235F51b11b9F96d6673df37553Ef58373c4324F9"],
  ["Prediction Market", "0x3d17bD6d87563cB172E7C634341fBc8A14574035"],
  ["Multi-Source Oracle", "0x2Ab508Bb9Be84ea4ea8388b9b8872017729a2C82"],
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function readState(name, address) {
  for (let i = 0; i < 5; i++) {
    try {
      const s = await client.readContract({ address, functionName: "get_state", args: [] })
      const str = JSON.stringify(s)
      console.log(`OK ${name} ${address} (len=${str.length})`)
      console.log("   state:", str.slice(0, 200))
      return true
    } catch (e) {
      const m = String((e && e.message) || e)
      console.log(`  attempt ${i + 1} failed: ${m.slice(0, 120)}`)
      if (i < 4) await sleep(4000)
    }
  }
  console.log(`FAIL ${name} ${address}`)
  return false
}

let ok = true
for (const [name, addr] of TARGETS) {
  ok = (await readState(name, addr)) && ok
}
console.log(ok ? "PROBE PASS" : "PROBE FAIL")
process.exit(ok ? 0 : 1)
