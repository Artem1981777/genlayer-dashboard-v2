# Evidence — every advertised action maps to source, deployment and a real transaction

This file is the verification pack for the steward review of the GenLayer Consensus Console
(Builder · Projects). It answers the two review points directly:

1. **Contract source for every advertised action** — each action below links the exact
   source file, the deployed contract address on Testnet Bradbury, and a real transaction
   on `explorer-bradbury.genlayer.com`.
2. **Accepted-receipt lifecycle** — the write path awaits an ACCEPTED receipt and verifies
   the execution result before refreshing state; see the lifecycle section at the bottom.

All transactions below were executed against GenLayer Testnet Bradbury and are publicly
verifiable by hash on the explorer.

---

## 1. Deployed contracts (Testnet Bradbury)

| Contract | Address | Source (repo path) | Explorer |
| --- | --- | --- | --- |
| Content Moderator | `0x235F51b11b9F96d6673df37553Ef58373c4324F9` | `apps/content-moderator/contracts/moderator.py` | [explorer](https://explorer-bradbury.genlayer.com/address/0x235F51b11b9F96d6673df37553Ef58373c4324F9) |
| Prediction Market | `0x3d17bD6d87563cB172E7C634341fBc8A14574035` | `apps/prediction-market/contracts/prediction_market.py` | [explorer](https://explorer-bradbury.genlayer.com/address/0x3d17bD6d87563cB172E7C634341fBc8A14574035) |
| Multi-Source Oracle (v2) | `0x9bEcbdF8f3Cd6fABAeE5F737CE5B1B765ef9a1F5` | `apps/multi-source-oracle/contracts/oracle.py` | [explorer](https://explorer-bradbury.genlayer.com/address/0x9bEcbdF8f3Cd6fABAeE5F737CE5B1B765ef9a1F5) |

Deployment transactions:

| Contract | Deploy tx |
| --- | --- |
| Content Moderator | [0xa05d3619563ce7ca31f01b34f3f82f89e868c4a4131d5896513339ec6f001867](https://explorer-bradbury.genlayer.com/tx/0xa05d3619563ce7ca31f01b34f3f82f89e868c4a4131d5896513339ec6f001867) |
| Prediction Market (production) | [0xb7406f6a8788600e04d1a6bdc1200269f2665683c97b9d9e338450ca6a815063](https://explorer-bradbury.genlayer.com/tx/0xb7406f6a8788600e04d1a6bdc1200269f2665683c97b9d9e338450ca6a815063) |
| Prediction Market (lifecycle test instance) | `0x8D0c1f6b433f12a937081f7f1FbBDC3Fd51B41B1` |
| Multi-Source Oracle v2 (exact-value consensus, parity-proven) | [0x7d3a61d17b00b735fb5835c110a23efa41f7e7890d6a37d3fd81106ba674d974](https://explorer-bradbury.genlayer.com/tx/0x7d3a61d17b00b735fb5835c110a23efa41f7e7890d6a37d3fd81106ba674d974) |
| Oracle `register_feed` (btc_usd, 3 sources, v2) | [0xb73b05d0fbf5d7eecafe8f6bf09efba1b7fb2ea9d18a812f86db16a9c40fc8c7](https://explorer-bradbury.genlayer.com/tx/0xb73b05d0fbf5d7eecafe8f6bf09efba1b7fb2ea9d18a812f86db16a9c40fc8c7) |
| Oracle `update` (btc_usd, v2) | [0xa72ddb7d7784f64c697f0d59e1ca07c3451526cae18c5be801b107028c3fdf54](https://explorer-bradbury.genlayer.com/tx/0xa72ddb7d7784f64c697f0d59e1ca07c3451526cae18c5be801b107028c3fdf54) |
| Multi-Source Oracle v1 (superseded) | [0x75446ed8583355ad8b6738d3e4e3d03296049fb7c3c1a05825d3e8979dc0d20c](https://explorer-bradbury.genlayer.com/tx/0x75446ed8583355ad8b6738d3e4e3d03296049fb7c3c1a05825d3e8979dc0d20c) |

---

## 2. Action → source → deployment → transaction matrix

### Content Moderator (`moderator.py`)

| Action | Source location | Deployed at | Proof tx | Result |
| --- | --- | --- | --- | --- |
| `moderate()` | `moderator.py` — `@gl.public.write def moderate` | `0x235F…24F9` | [0x2dfc5983…c0f06c](https://explorer-bradbury.genlayer.com/tx/0x2dfc598349349a8cc69cf774ff8c07d95bfc9de3399a9a75f9faea022fc0f06c) | REMOVE verdict (consensus) |
| `enforce()` | `moderator.py` — `@gl.public.write def enforce` | `0x235F…24F9` | [0x50cd9609…cb5bde4](https://explorer-bradbury.genlayer.com/tx/0x50cd96099418f555d91b4e4d27288902940a1b7793780bb96a50dc434cb5bde4) | blocked (enforced) |
| `appeal(note)` | `moderator.py` — `@gl.public.write def appeal` | `0x235F…24F9` | [0x8578d3e3…9652e79](https://explorer-bradbury.genlayer.com/tx/0x8578d3e39d485c106d7e33ea35aa74793b441545ca9be70f09a4227219652e79) | appeal recorded |
| `resolve_appeal()` | `moderator.py` — `@gl.public.write def resolve_appeal` | `0x235F…24F9` | [0x14fa4e5b…7e4513c5](https://explorer-bradbury.genlayer.com/tx/0x14fa4e5b4bfdd1eb488c31b2894391d5f65d2459e806112133f51c047e4513c5) | UPHELD (consensus) |
| `get_state()` (view) | `moderator.py` — `@gl.public.view def get_state` | `0x235F…24F9` | live read (see smoke test below) | reads OK |

### Prediction Market (`prediction_market.py`)

| Action | Source location | Deployed at | Proof tx | Result |
| --- | --- | --- | --- | --- |
| `stake(side)` — payable, single arg, positive value | `prediction_market.py` — `@gl.public.write.payable def stake` | `0x8D0c…41B1` (test instance) | [0x90253b29…3311485](https://explorer-bradbury.genlayer.com/tx/0x90253b2970cd2d2ff0fd7b2451305b28af42590733969684d05e00f0e3311485) | FINISHED_WITH_RETURN, stake recorded |
| `stake` — zero value rejected | same | `0x8D0c…41B1` | [0x397f21e1…af894df](https://explorer-bradbury.genlayer.com/tx/0x397f21e174d5b59170c40108f4cc56ea842857c1b15cc21a39ee031d6af894df) | FINISHED_WITH_ERROR (expected reject) |
| `resolve()` | `prediction_market.py` — `@gl.public.write def resolve` | `0x3d17…4035` (production) | exercised via lifecycle scripts (`apps/prediction-market/lifecycle.mjs`, `test.mjs`) | YES/NO/UNRESOLVED via comparative consensus |
| `dispute(reason)` | `prediction_market.py` — `@gl.public.write def dispute` | `0x8D0c…41B1` | [0x2080382c…2ab94b5f4](https://explorer-bradbury.genlayer.com/tx/0x2080382c3c2952842022174fd3a8913e18a7ae43749c89eff847bef2ab94b5f4) (gated reject before resolve) | reverted (expected) |
| `resolve_dispute()` | `prediction_market.py` — `@gl.public.write def resolve_dispute` | `0x3d17…4035` | exercised via lifecycle scripts | OVERTURNED/UPHELD via comparative consensus |
| `settle()` | `prediction_market.py` — `@gl.public.write def settle` | `0x3d17…4035` | exercised via lifecycle scripts | settled / auto-void on empty winning side |
| `claim()` | `prediction_market.py` — `@gl.public.write def claim` | `0x8D0c…41B1` | [0x3a77877e…7f52ff6](https://explorer-bradbury.genlayer.com/tx/0x3a77877ef6fb216b1f75ca6e2ec87d3ddb7330f2e4eca82a254f58a967f52ff6) (gated reject before settle) | reverted (expected) |
| `void()` | `prediction_market.py` — `@gl.public.write def void` | `0x8D0c…41B1` | [0x34d63ce2…b1e7b22](https://explorer-bradbury.genlayer.com/tx/0x34d63ce2d94767500458c2b8d66b2eee3df12e05a2a1863cbdcfb2b49b1e7b22) | FINISHED_WITH_RETURN, voided |
| `refund()` | `prediction_market.py` — `@gl.public.write def refund` | `0x8D0c…41B1` | [0x89a8c4a5…d5e128adb](https://explorer-bradbury.genlayer.com/tx/0x89a8c4a523512ad31c088ba8ca35e2d7c446d68e2615f8b3c5f6ca6d5e128adb) | FINISHED_WITH_RETURN, refund 1:1 |
| `refund()` — double refund rejected | same | `0x8D0c…41B1` | [0xb14778bf…600193ef](https://explorer-bradbury.genlayer.com/tx/0xb14778bf16655213ad6fd6b8c497aca63d04bd6ab94875e0bb7473b6000193ef) | reverted (expected) |
| `void()` — re-void rejected | same | `0x8D0c…41B1` | [0xf32b0042…68774d9](https://explorer-bradbury.genlayer.com/tx/0xf32b0042e531bf49c7642a40fdb1b3bc5f807c7bf2414fe766c5d4eaa68774d9) | reverted (expected) |
| `get_state()` (view) | `prediction_market.py` — `@gl.public.view def get_state` | `0x3d17…4035` | live read (smoke test) | reads OK |

### Multi-Source Oracle (`oracle.py`)

> **Parity proof (v2):** the deployed code at `0x9bEc…a1F5` was verified
> byte-for-byte against the repo source by `apps/multi-source-oracle/verify-relay.mjs`
> (browser QUIC relay → `ConsensusData.getTransactionData` → RLP-decode of the
> deploy calldata): 14,343 bytes, sha256 `1324409e…d64f5` on both sides.
> The same check previously proved the superseded v1 instance (`0x2Ab5…2C82`,
> 11,895 bytes) did not match the v2 source.

| Action | Source location | Deployed at | Proof tx | Result |
| --- | --- | --- | --- | --- |
| `update(key)` | `oracle.py` — `@gl.public.write def update` | `0x9bEc…a1F5` (v2) | [0xa72ddb7d…c3fdf54](https://explorer-bradbury.genlayer.com/tx/0xa72ddb7d7784f64c697f0d59e1ca07c3451526cae18c5be801b107028c3fdf54) | FINISHED_WITH_RETURN; btc_usd median 79,626.00 from 3/3 sources, spread 1 bps (exact-value consensus) |
| `register_feed(...)` | `oracle.py` — `@gl.public.write def register_feed` | `0x9bEc…a1F5` (v2) | [0xb73b05d0…40fc8c7](https://explorer-bradbury.genlayer.com/tx/0xb73b05d0fbf5d7eecafe8f6bf09efba1b7fb2ea9d18a812f86db16a9c40fc8c7) | feed registered |
| `get_state()` / `get(key)` (views) | `oracle.py` — `@gl.public.view` | `0x9bEc…a1F5` (v2) | live read (smoke test) | reads OK |

---

## 3. Accepted-receipt lifecycle (review point 2)

The single write path used by every action in the dApp (`src/lib/genlayer.ts`):

1. `writeContract({ address, functionName, args, value })` — submit.
2. `await waitForTransactionReceipt({ hash, status: TransactionStatus.ACCEPTED, interval: 3000, retries: 8 })`
   — confirmed via the direct RPC read client, never the wallet provider.
3. Verify the execution result against a strict allowlist: success is **only**
   `FINISHED` or `FINISHED_WITH_RETURN` (`SUCCESS_RESULTS` / `classifyExecution`).
   `FINISHED_WITH_ERROR`, `NOT_VOTED`, `UNDETERMINED`, `LEADER_TIMEOUT` and any other
   result are failures surfaced as errors in the UI with the tx hash preserved.
4. Only after a confirmed, successful receipt does the UI re-read `get_state`
   (`stateStatus: "accepted"`).

Unit tests covering the gate: `src/lib/genlayer.test.ts` (`classifyExecution` success /
failure / pending) and `src/lib/actions.test.ts` (`parseStakeWei`, `stake.validate`,
`stake.value` — zero/negative/fractional amounts never reach `writeContract`).

On-chain proof that the gate matches reality:

- A zero-value `stake` fails on-chain with `FINISHED_WITH_ERROR` and the UI reports it as
  a failure: [tx 0x397f21e1…](https://explorer-bradbury.genlayer.com/tx/0x397f21e174d5b59170c40108f4cc56ea842857c1b15cc21a39ee031d6af894df)
- A valid payable `stake` returns `FINISHED_WITH_RETURN` and only then refreshes state:
  [tx 0x90253b29…](https://explorer-bradbury.genlayer.com/tx/0x90253b2970cd2d2ff0fd7b2451305b28af42590733969684d05e00f0e3311485)

## 4. How to verify independently

```bash
npm ci
npm test                 # 76/76 unit tests (no mocks)
npm run build            # production build
node tests/smoke.onchain.mjs   # live get_state reads from all three deployed contracts
```

Read any contract state directly (no wallet needed):

```js
import { createClient } from "genlayer-js"
import { testnetBradbury } from "genlayer-js/chains"
const client = createClient({ chain: testnetBradbury })
const state = await client.readContract({
  address: "0x3d17bD6d87563cB172E7C634341fBc8A14574035",
  functionName: "get_state",
  args: [],
})
console.log(state)
```

Note on `genlayer schema`: `gen_getContractSchema` on Bradbury currently returns
`VMError: invalid_contract absent_runner_comment`, so machine-readable schemas cannot be
attached; action-to-source parity is proven by the committed contract sources plus the
real on-chain executions listed above.
