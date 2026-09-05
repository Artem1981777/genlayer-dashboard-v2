# GenLayer Consensus Console

Interactive multi-contract dApp on GenLayer Testnet Bradbury: a thin browser client that submits real inputs to three deployed Intelligent Contracts (content moderation, prediction market, multi-source price oracle) and reads their on-chain state. Every consensus-critical decision — moderation verdicts, market outcomes, oracle medians — is computed and stored on-chain by the contracts; the frontend never decides anything.

**Live app:** <https://artem1981777.github.io/genlayer-dashboard-v2/>
**Source:** <https://github.com/Artem1981777/genlayer-dashboard-v2>

**Status (v1.5.0):** 76/76 unit tests · `tsc --noEmit` clean · `next build` green · live smoke reads of all three deployed contracts. Steward-review evidence: [`docs/EVIDENCE.md`](docs/EVIDENCE.md) · [`docs/REVIEW-RESPONSE.md`](docs/REVIEW-RESPONSE.md).

## Table of contents

1. [TL;DR](#tldr)
2. [Why GenLayer / Intelligent Contracts](#why-genlayer--intelligent-contracts)
3. [Architecture](#architecture)
4. [Deployed contracts](#deployed-contracts)
5. [Features per contract](#features-per-contract)
6. [Consensus design](#consensus-design)
7. [Transaction lifecycle](#transaction-lifecycle)
8. [Quick start](#quick-start)
9. [Deploy](#deploy)
10. [Testing](#testing)
11. [Usage walkthrough](#usage-walkthrough)
12. [Evidence & verification](#evidence--verification)
13. [Project structure](#project-structure)
14. [Security & limitations](#security--limitations)
15. [Roadmap](#roadmap)
16. [Changelog](#changelog)
17. [Links](#links)

## TL;DR

Three Intelligent Contracts run on GenLayer Testnet Bradbury, each deciding something that
needs *judgment*, not deterministic code:

- **Content Moderator** — validators reason over a natural-language policy and produce an
  on-chain APPROVE / FLAG / REMOVE verdict with category, confidence and rationale.
- **Prediction Market** — resolves YES / NO / UNRESOLVED from cited web sources, with
  staking, a mandatory dispute window, settlement and payouts.
- **Multi-Source Oracle** — median-consensus BTC/USD from Coinbase, CoinGecko and Kraken
  with tolerance and max-spread guards.

The dApp connects an EIP-6963 wallet, submits real write transactions, awaits accepted
receipts, and reads results. The frontend only submits inputs and reads state.

## Why GenLayer / Intelligent Contracts

Moderation verdicts, market resolutions and price aggregation cannot be computed by
deterministic code: they require natural-language reasoning over policies, web evidence
and numeric data. GenLayer's **Optimistic Democracy** runs a leader proposal through
validator review; the **Equivalence Principle** requires validators to independently
reach the same *decision* (not the same wording) for a transaction to be accepted. If
consensus is not reached, the transaction is UNDETERMINED and state does not change.

- Docs: <https://docs.genlayer.com/>
- Equivalence Principle: <https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle>
- Writing data: <https://docs.genlayer.com/developers/decentralized-applications/writing-data>
- Reading data: <https://docs.genlayer.com/developers/decentralized-applications/reading-data>

## Architecture

```
┌──────────────┐     ┌────────────────────────────┐     ┌───────────────────────┐
│ Wallet       │     │ dApp (Next.js, static      │     │ genlayer-js           │
│ EIP-6963     ├───► │ export, GitHub Pages)      ├───► │ createClient          │
│ discovery    │     │ submits inputs, reads      │     │ writeContract /       │
└──────────────┘     │ state — decides NOTHING    │     │ readContract          │
                     └────────────────────────────┘     └───────────┬───────────┘
                                                                    │ RPC
                                                                    ▼
                                                     ┌────────────────────────────┐
                                                     │ GenLayer Testnet Bradbury  │
                                                     │ ┌────────────────────────┐ │
                                                     │ │ Content Moderator IC   │ │
                                                     │ │ Prediction Market IC   │ │
                                                     │ │ Multi-Source Oracle IC │ │
                                                     │ └────────────────────────┘ │
                                                     │ Optimistic Democracy +    │
                                                     │ Equivalence Principle     │
                                                     └────────────┬───────────────┘
                                                                  │
                                                                  ▼
                                                     ┌────────────────────────────┐
                                                     │ Explorer (public proof)    │
                                                     │ explorer-bradbury.         │
                                                     │ genlayer.com               │
                                                     └────────────────────────────┘
```

The boundary is strict: the frontend builds transactions (`writeContract`) and reads state
(`readContract` / `get_state`); all verdicts, outcomes, dispute resolutions and median
prices are computed inside the Intelligent Contracts under validator consensus.

## Deployed contracts

| Contract | Address | Explorer | Source | Deploy tx |
| --- | --- | --- | --- | --- |
| Content Moderator | `0x235F51b11b9F96d6673df37553Ef58373c4324F9` | [explorer](https://explorer-bradbury.genlayer.com/address/0x235F51b11b9F96d6673df37553Ef58373c4324F9) | [`apps/content-moderator/contracts/moderator.py`](apps/content-moderator/contracts/moderator.py) | [tx](https://explorer-bradbury.genlayer.com/tx/0xa05d3619563ce7ca31f01b34f3f82f89e868c4a4131d5896513339ec6f001867) |
| Prediction Market | `0x3d17bD6d87563cB172E7C634341fBc8A14574035` | [explorer](https://explorer-bradbury.genlayer.com/address/0x3d17bD6d87563cB172E7C634341fBc8A14574035) | [`apps/prediction-market/contracts/prediction_market.py`](apps/prediction-market/contracts/prediction_market.py) | [tx](https://explorer-bradbury.genlayer.com/tx/0xb7406f6a8788600e04d1a6bdc1200269f2665683c97b9d9e338450ca6a815063) |
| Multi-Source Oracle | `0x2Ab508Bb9Be84ea4ea8388b9b8872017729a2C82` | [explorer](https://explorer-bradbury.genlayer.com/address/0x2Ab508Bb9Be84ea4ea8388b9b8872017729a2C82) | [`apps/multi-source-oracle/contracts/oracle.py`](apps/multi-source-oracle/contracts/oracle.py) (v1 deployed; v2 exact-value revision pending redeploy — see [app README](apps/multi-source-oracle/README.md#deployment-status)) | [tx](https://explorer-bradbury.genlayer.com/tx/0x75446ed8583355ad8b6738d3e4e3d03296049fb7c3c1a05825d3e8979dc0d20c) |

Additional addresses (history / test instances):

- Content Moderator (earlier revisions): `0x2d8257E5C7343f40F7Da5380E0d26b599a6036DE`, `0x391Cd354F2D74058F5dCAA42D80ECF158A2043Cf`, `0xc87881c7223e1d47Bf13EBDC50ADFaA0d0EFC4dC`, `0xF83a360cBA484C09E34018D3FF2f3800d6470DC3`, `0x0747802565F083d1784ED3f8Ff973Bf0920A61ea`, `0xD7E2ef74a1ACAAF579E97b2843Cac02EefE15A2c`
- Prediction Market (lifecycle test instance, deterministic no-LLM proofs): `0x8D0c1f6b433f12a937081f7f1FbBDC3Fd51B41B1`
- AI Escrow Arbiter (bonus demo, not part of the submission): `0x6f33FF874366aEd9B071505Ffa1057072b8FC37C`

## Features per contract

### Content Moderator — [`apps/content-moderator/contracts/moderator.py`](apps/content-moderator/contracts/moderator.py)

Purpose: decide whether user content complies with a natural-language community policy.

| Method | Type | Caller | Effect |
| --- | --- | --- | --- |
| `__init__(rules, content, item_id, source, author)` | deploy | — | stores rules, content, SHA-256 content hash; status `pending` |
| `moderate()` | write | anyone | runs the equivalence-principle verdict; status `pending → moderated` |
| `enforce()` | write | creator only | applies the verdict (REMOVE blocks content, FLAG limits it); `moderated → enforced` |
| `appeal(note)` | write | content author only | opens an appeal on a FLAG/REMOVE enforcement; max 2 appeals; `enforced → appealed` |
| `resolve_appeal()` | write | creator only | re-runs the verdict with the appeal note; `appealed → resolved`, outcome OVERTURNED/UPHELD |
| `set_content(content, item_id, source)` | write | creator only | replaces content before moderation |
| `get_state()` | view | — | full case state incl. verdict, category, confidence, history |
| `read_content()` | view | — | content, or a removal placeholder when blocked |
| `verify_content(content)` | view | — | SHA-256 check against the stored hash |

Invariants: only the creator enforces/resolves; only the author appeals; appeals limited
to 2; verdict must be one of APPROVE/FLAG/REMOVE; confidence clamped to 0..100.

### Prediction Market — [`apps/prediction-market/contracts/prediction_market.py`](apps/prediction-market/contracts/prediction_market.py)

Purpose: resolve a yes/no question from cited web sources with staking and disputes.

| Method | Type | Caller | Effect |
| --- | --- | --- | --- |
| `__init__(question, rules, source1..3, market_id, dispute_window_seconds)` | deploy | — | stores config + hashes; status `open` |
| `stake(side)` | **write, payable** | anyone | records the tx value on the chosen side; first stake freezes sources + config |
| `add_source(url)` | write | creator only | adds a source while open and unfrozen |
| `resolve()` | write | creator only | comparative-consensus outcome from web sources; YES/NO opens a mandatory dispute window |
| `dispute(reason)` | write | stakers only | contests the outcome while the window is open; max 2 rounds |
| `resolve_dispute()` | write | creator only | re-resolves with the dispute note; opens a fresh dispute window |
| `settle()` | write | creator only | after the window closes; pari-mutuel pools; auto-voids if the winning side is empty |
| `void()` | write | creator only | voids an unresolved market; refunds open |
| `claim()` | write | stakers only | single-use pari-mutuel payout on a settled market |
| `refund()` | write | stakers only | single-use 1:1 refund on a voided market |
| `get_state()` | view | — | full market state incl. pools, positions, claims, history |
| `verify_question(q)` / `verify_rules(r)` | view | — | SHA-256 checks |

Invariants: `stake` requires `value > 0` and exactly one `side` argument (YES/NO); the
source set and config freeze at the first stake; settlement is impossible while the
dispute window is open; claims/refunds are single-use (anti-double-spend); payouts use
`emit_transfer(value=u256(...), on="finalized")`.

### Multi-Source Oracle — [`apps/multi-source-oracle/contracts/oracle.py`](apps/multi-source-oracle/contracts/oracle.py)

Purpose: publish a median price from multiple independent web sources with spread guards.

| Method | Type | Caller | Effect |
| --- | --- | --- | --- |
| `__init__()` | deploy | — | owner = deployer |
| `register_feed(key, question, sources_json, tolerance_bps, max_spread_bps, decimals)` | write | owner only | configures a feed (≥ 2 http(s) sources) |
| `remove_feed(key)` | write | owner only | deletes a feed and its value |
| `update(key)` | write | anyone | fetches all sources, median-consensus with tolerance + max-spread guard; publishes value + provenance |
| `get_state()` | view | — | feeds, values, history |
| `get(key)` / `get_value(key)` / `get_feed(key)` / `list_feeds()` | view | — | feed/value reads |
| `is_stale(key, max_age_rounds)` | view | — | staleness check |

Invariants: publication requires ≥ 2 usable sources and a spread ≤ `max_spread_bps`;
the validator must independently re-derive the **exact same outcome** (ok, median,
spread, count, decimals) from its own fetches — there is no tolerance band on the
median; `tolerance_bps` only bounds per-source liveness corroboration between the
leader's and validator's fetches. On guard failure the update is rejected and state
does not change. The live `btc_usd` feed uses Coinbase, CoinGecko and Kraken with
tolerance 100 bps and max spread 500 bps.

## Consensus design

### Content Moderator — `moderate()` / `resolve_appeal()`

- Pattern: **comparative equivalence** (`gl.eq_principle.prompt_comparative`).
- Leader: runs the moderation prompt (with an escalation pass when confidence < 70),
  returns compact JSON `{verdict, reason, category, confidence, escalated, needs_review}`.
- Validator comparison: the final `verdict` (APPROVE/FLAG/REMOVE) must match exactly.
  Confidence, category, reason wording and escalation are explicitly ignored — only the
  decision is compared.
- Unparseable output defaults to FLAG (human review), never to APPROVE.
- On UNDETERMINED: the transaction does not finalize and the case stays `pending` (or
  `appealed`); the UI shows the failure with the tx hash.

### Prediction Market — `resolve()` / `resolve_dispute()`

- Pattern: **comparative equivalence** (`gl.eq_principle.prompt_comparative`).
- Leader: fetches each source via `gl.nondet.web.render(url, mode="text")`, builds an
  evidence prompt, extracts `{outcome: YES|NO|UNRESOLVED}` via `gl.nondet.exec_prompt`.
- Validator comparison: the final `outcome` must match exactly; wording, source text and
  which sources loaded are ignored. The prompt instructs ignoring failed fetches so a
  single dead source cannot force UNRESOLVED.
- On UNDETERMINED: state does not change; the market stays `open` (or `disputed`).

### Multi-Source Oracle — `update(key)`

- Pattern: **custom non-deterministic block** (`gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`).
- Leader: fetches every source (`gl.nondet.web.get` via the module-level
  `_fetch_provenance` helper), extracts the number, derives the full outcome —
  `ok`, `median_units`, `spread_bps`, `sources_used`, `decimals`, `provenance` —
  deterministically (`_derive_result`).
- Validator: first checks `isinstance(leader_result, gl.vm.Return)`; re-derives the
  outcome from the leader's provenance (claims must be bound to evidence); then
  **independently re-fetches all sources** and re-derives its own outcome, requiring
  **exact equality on every field** — no tolerance band on the median. Per-source
  liveness corroboration within `tolerance_bps` can only reject, never widen the
  accepted set. Nothing is published from leader-supplied data alone.
- Guards: `ok = (n >= 2) and (spread_bps <= max_spread_bps)`; on failure the update is
  rejected (`assert canon.ok`) and state does not change.

All `gl.nondet.*` calls occur strictly inside equivalence-principle functions or the
`run_nondet_unsafe` leader/validator pair — never in deterministic contract code.

## Transaction lifecycle

Every write action follows one path ([`src/lib/genlayer.ts`](src/lib/genlayer.ts)):

```
writeContract({ address, functionName, args, value })
        │
        ▼
await waitForTransactionReceipt({ hash, status: ACCEPTED, interval: 3000, retries: 8 })
        │  (direct RPC read client — never the wallet provider)
        ▼
classifyExecution(txExecutionResultName)
        │
        ├── FINISHED / FINISHED_WITH_RETURN  → success → re-read get_state
        ├── PENDING (transport-only, no consensus answer) → UI keeps hash, keeps polling
        └── anything else (FINISHED_WITH_ERROR, NOT_VOTED, UNDETERMINED,
            LEADER_TIMEOUT, …) → FAILURE → error surfaced in UI, tx hash preserved
```

Status interpretation in the UI:

| Status | Meaning | UI treatment |
| --- | --- | --- |
| PENDING / PROPOSING / COMMITTING / REVEALING | in flight | "submitted · finalizing on-chain", auto re-poll |
| ACCEPTED | consensus reached (fast path) | success only if the execution result is FINISHED/FINISHED_WITH_RETURN |
| FINALIZED | final | same execution-result gate |
| UNDETERMINED | no consensus | failure; state not changed |
| CANCELED / LEADER_TIMEOUT | aborted | failure |

The strict allowlist lives in `SUCCESS_RESULTS` / `classifyExecution`
([`src/lib/genlayer.ts`](src/lib/genlayer.ts)) and is unit-tested in
[`src/lib/genlayer.test.ts`](src/lib/genlayer.test.ts).

## Quick start

Requirements: Node ≥ 18, npm, a browser with an EIP-6963 wallet (MetaMask).

```bash
git clone https://github.com/Artem1981777/genlayer-dashboard-v2.git
cd genlayer-dashboard-v2
npm ci
npm run dev
```

Open <http://localhost:3000>, connect your wallet, switch to GenLayer Testnet Bradbury
(chain id `0x107d`), and interact with the seeded contracts. Testnet GEN is available
from the faucet: <https://testnet-faucet.genlayer.foundation/>

## Deploy

Contracts are deployed with the GenLayer CLI against Testnet Bradbury:

```bash
npm install -g genlayer
genlayer network testnet-bradbury        # or: genlayer network set

# Content Moderator
genlayer deploy --contract apps/content-moderator/contracts/moderator.py \
  --args '["<rules>", "<content>", "<item_id>", "<source>", "<author>"]'

# Prediction Market
genlayer deploy --contract apps/prediction-market/contracts/prediction_market.py \
  --args '["<question>", "<rules>", "<source1>", "<source2>", "<source3>", "<market_id>", <dispute_window_seconds>]'

# Multi-Source Oracle
genlayer deploy --contract apps/multi-source-oracle/contracts/oracle.py
```

Alternatively, the repo's Node deploy scripts (`apps/*/deploy.mjs`) deploy via
`genlayer-js` and print the resulting address.

After deploying, update the tracked addresses in
[`src/lib/projects.ts`](src/lib/projects.ts) (`seedContracts`) and rebuild:

```bash
npm run build   # static export to out/
```

The live site is served from the `gh-pages` branch (GitHub Pages).

## Testing

```bash
npm test                        # 76/76 unit tests (vitest, no mocks)
npx tsc --noEmit                # typecheck
npm run build                   # production build
node tests/smoke.onchain.mjs    # live get_state reads from all three deployed contracts
node tests/probe-reads.mjs      # diagnostic: read each contract with retries
```

Unit coverage ([`src/lib/actions.test.ts`](src/lib/actions.test.ts),
[`src/lib/genlayer.test.ts`](src/lib/genlayer.test.ts)):

| Area | Tests |
| --- | --- |
| `classifyExecution` | success (FINISHED, FINISHED_WITH_RETURN), failure (FINISHED_WITH_ERROR, NOT_VOTED, UNDETERMINED, LEADER_TIMEOUT), pending |
| `parseStakeWei` | rejects empty, zero, negative, fractional, non-numeric; accepts positive integers |
| `stake.validate` / `stake.value` | side must be YES/NO; amount must be a positive integer before the wallet opens |
| Action visibility matrix | role (creator/author), phase (open/dispute_window/disputed/dispute_resolved/settled/voided), per-caller claim/dispute/settle/refund gating, dispute-window open/closed boundary, 2-round dispute limit, source freeze, void gating |
| Live reads | `get_state` from deployed Content Moderator and Prediction Market contracts |

Deterministic on-chain payable/gating suite (no LLM, needs a funded key):
`apps/prediction-market/test-payable.mjs` — 8 checks: zero-value stake reverts, payable
stake recorded, claim-before-settle reverts, dispute-before-resolve reverts, void,
refund 1:1, double-refund reverts, re-void reverts.

## Usage walkthrough

### 1. Content moderation: moderate → enforce → appeal → resolve_appeal

1. Open the live app, connect a wallet, pick the Content Moderator project and the
   seeded case (`0x235F…24F9`).
2. Press **Moderate** — a write tx runs the equivalence-principle verdict (~1–2 min of
   AI consensus). Example on-chain result: verdict REMOVE, category other, confidence 100
   ([tx](https://explorer-bradbury.genlayer.com/tx/0x2dfc598349349a8cc69cf774ff8c07d95bfc9de3399a9a75f9faea022fc0f06c)).
3. The creator presses **Enforce** — content is blocked on-chain
   ([tx](https://explorer-bradbury.genlayer.com/tx/0x50cd96099418f555d91b4e4d27288902940a1b7793780bb96a50dc434cb5bde4)).
4. The content author presses **Appeal** with a note
   ([tx](https://explorer-bradbury.genlayer.com/tx/0x8578d3e39d485c106d7e33ea35aa74793b441545ca9be70f09a4227219652e79)).
5. The creator presses **Resolve appeal** — validators re-run the verdict with the appeal
   note; outcome UPHELD or OVERTURNED
   ([tx](https://explorer-bradbury.genlayer.com/tx/0x14fa4e5b4bfdd1eb488c31b2894391d5f65d2459e806112133f51c047e4513c5)).

### 2. Prediction market: stake → resolve → dispute → settle → claim

1. Pick the Prediction Market project (`0x3d17…4035`).
2. **Stake**: choose YES or NO and a whole positive wei amount; the UI rejects zero or
   fractional amounts before the wallet opens. The stake is the transaction value —
   `stake(side)` takes exactly one argument
   ([valid stake tx](https://explorer-bradbury.genlayer.com/tx/0x90253b2970cd2d2ff0fd7b2451305b28af42590733969684d05e00f0e3311485),
   [zero-value rejected](https://explorer-bradbury.genlayer.com/tx/0x397f21e174d5b59170c40108f4cc56ea842857c1b15cc21a39ee031d6af894df)).
   The first stake freezes the source set and market config on-chain.
3. The creator presses **Resolve** — validators fetch the cited sources and reach a
   comparative-consensus outcome; a YES/NO outcome opens the mandatory dispute window
   (live countdown in the UI).
4. Any staker can **Dispute** with a reason while the window is open (max 2 rounds); the
   creator then **Resolve dispute**, which opens a fresh window.
5. After the window closes the creator presses **Settle**; if nobody backed the winning
   side the market auto-voids and refunds open.
6. Winners press **Claim** for a pari-mutuel payout; on a voided market stakers press
   **Refund** for a 1:1 return
   ([refund tx](https://explorer-bradbury.genlayer.com/tx/0x89a8c4a523512ad31c088ba8ca35e2d7c446d68e2615f8b3c5f6ca6d5e128adb),
   [double refund rejected](https://explorer-bradbury.genlayer.com/tx/0xb14778bf16655213ad6fd6b8c497aca63d04bd6ab94875e0bb7473b6000193ef)).

### 3. Oracle: update(key)

1. Pick the Multi-Source Oracle project (`0x2Ab5…2C82`).
2. Press **Update feed** with key `btc_usd` — validators independently fetch Coinbase,
   CoinGecko and Kraken, corroborate values within tolerance, and publish the median with
   provenance and spread
   ([tx](https://explorer-bradbury.genlayer.com/tx/0x5c3f94b50f9dc8c705f12bec8b5d37fffc3e0ef379eb44b2402c366cf2258c72) —
   FINALIZED, 3 sources, spread 2 bps).
3. The panel shows the published median, samples, provenance and spread from `get_state`.

## Evidence & verification

Full evidence pack with per-action transactions: [`docs/EVIDENCE.md`](docs/EVIDENCE.md).
Steward review response: [`docs/REVIEW-RESPONSE.md`](docs/REVIEW-RESPONSE.md).

Verify independently:

```bash
npm ci
npm test                          # 76/76
npx tsc --noEmit                  # clean
npm run build                     # passes
node tests/smoke.onchain.mjs      # live reads from all three contracts
```

Or read any contract directly (no wallet needed):

```js
import { createClient } from "genlayer-js"
import { testnetBradbury } from "genlayer-js/chains"
const client = createClient({ chain: testnetBradbury })
const state = await client.readContract({
  address: "0x3d17bD6d87563cB172E7C634341fBc8A14574035",
  functionName: "get_state",
  args: [],
})
```

Note: `gen_getContractSchema` on Bradbury currently returns
`VMError: invalid_contract absent_runner_comment`, so machine-readable schemas cannot be
attached; parity is proven by committed sources plus the on-chain executions in the
evidence pack.

## Project structure

```
genlayer-dashboard-v2/
├── apps/
│   ├── content-moderator/
│   │   ├── contracts/moderator.py        # Content Moderator IC
│   │   ├── deploy.mjs / interact.mjs / test.mjs / resume.mjs
│   │   └── docs/SECURITY-AUDIT.md
│   ├── prediction-market/
│   │   ├── contracts/prediction_market.py # Prediction Market IC
│   │   ├── deploy.mjs / interact.mjs / lifecycle.mjs / test.mjs / test-payable.mjs
│   │   └── docs/SECURITY-AUDIT.md
│   └── multi-source-oracle/
│       ├── contracts/oracle.py           # Multi-Source Oracle IC
│       └── deploy.mjs / register.mjs / update.mjs
├── src/
│   ├── app/                              # Next.js routes (/, /escrow, /analytics)
│   ├── components/                       # UI: actions-panel, case-panel, dispute-countdown, …
│   ├── hooks/                            # use-wallet (EIP-6963), use-cases
│   └── lib/
│       ├── genlayer.ts                   # client, write+confirm lifecycle, strict result gate
│       ├── actions.ts                    # pure action defs + per-caller gating (unit-tested)
│       ├── projects.ts                   # project config + deployed addresses
│       ├── escrow.ts                     # bonus escrow demo (embedded contract source)
│       ├── store.ts / types.ts / format.ts / wallet.ts
│       └── *.test.ts                     # 76 unit tests
├── tests/
│   ├── smoke.onchain.mjs                 # live get_state reads (all three contracts)
│   └── probe-reads.mjs                   # diagnostic reads with retries
├── docs/
│   ├── EVIDENCE.md                       # action → source → deployment → tx matrix
│   └── REVIEW-RESPONSE.md                # steward review response
├── CHANGELOG.md
└── README.md
```

## Security & limitations

- **Testnet only.** All contracts and the dApp target GenLayer Testnet Bradbury; no
  mainnet deployment, no security audit.
- **UNDETERMINED risk.** If validators do not reach equivalence, the transaction is
  UNDETERMINED and state does not change; the UI reports it as a failure with the tx
  hash. AI actions occasionally need a retry on testnet.
- **LLM/web limits.** Moderation and market resolution depend on LLM reasoning and web
  fetches inside the validator sandbox; a dead source is ignored by design (moderation
  defaults to FLAG, market resolution to UNRESOLVED), and the oracle requires ≥ 2
  corroborated sources within tolerance.
- **Keys.** Private keys never leave the wallet; `.env.example` files document required
  variables for local scripts; no secrets are committed.
- **`genlayer schema` limitation.** `gen_getContractSchema` on Bradbury returns
  `VMError: invalid_contract absent_runner_comment`; parity is proven by sources + txs.
- **Escrow demo.** The `/escrow` route is a bonus demo (contract source embedded in
  `src/lib/escrow.ts`, deployed per-use from the browser) and is not part of the three
  claimed contracts.

## Roadmap

- Migrate the oracle feed set to configurable multi-asset feeds (ETH/USD, SOL/USD).
- Add a market-creation flow in the UI (currently markets are created via deploy scripts).
- On-chain appeal history graph in the analytics view.
- gltest integration suite against a local simulator once supported on Windows.

## Changelog

See [`CHANGELOG.md`](CHANGELOG.md).

## Links

- This repository: <https://github.com/Artem1981777/genlayer-dashboard-v2>
- Live app (GitHub Pages): <https://artem1981777.github.io/genlayer-dashboard-v2/>
- GenLayer website: <https://www.genlayer.com/>
- Docs: <https://docs.genlayer.com/>
- Portal: <https://portal.genlayer.foundation/>
- GenLayer Builders: <https://portal.genlayer.foundation/#/builders>
- Studio: <https://studio.genlayer.com/contracts>
- Explorer (Bradbury): <https://explorer-bradbury.genlayer.com/>
- Testnet faucet: <https://testnet-faucet.genlayer.foundation/>
- Simulator: <https://github.com/yeagerai/genlayer-simulator>
- GenLayer Talks: <https://talks.genlayer.foundation/>
- X: <https://x.com/GenLayer> · Foundation: <https://x.com/GenLayerFDN>
- Discord: <https://discord.gg/p3dnz6AypT> · Rally: <https://discord.gg/guFPdcpF74>
- Telegram: <https://t.me/genlayer>
- LinkedIn: <https://www.linkedin.com/company/genlayer-labs>
- Portal contributions: [180782](https://portal.genlayer.foundation/contribution/180782) · [184051](https://portal.genlayer.foundation/contribution/184051)
