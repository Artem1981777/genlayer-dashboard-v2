# GenLayer Consensus Console

## v1.4.0 — Dispute-window & market-lifecycle UI

The dashboard now surfaces the full on-chain Prediction Market lifecycle introduced by the hardened contract: source freeze at first stake, the mandatory time-based dispute window, and void reasons. Tests: 76/76 (`vitest run`); production build passes (`next build`).

- **Live dispute-window countdown** (`src/components/dispute-countdown.tsx`): ticks every second against the on-chain `dispute_deadline` (epoch seconds stored by `resolve()` / `resolve_dispute()`), shows % elapsed with a progress bar, turns warn-colored under 5 minutes, displays the exact local time settlement unlocks, and flips to a "window closed · outcome final · settlement unlocked" tag the moment the deadline passes. Renders nothing outside the `dispute_window` / `dispute_resolved` statuses.
- **Sources panel with freeze state** (`src/components/case-panel.tsx`): market sources render as clickable external links; after the first stake the panel switches to the frozen source set (`frozen_sources`), shows a "frozen · config locked" tag and the truncated `frozen_config_hash` proving the config snapshot taken at freeze time.
- **Void-reason banner** (`src/components/case-panel.tsx`): voided markets surface a human-readable reason derived from the on-chain `void_reason` (`winning_side_empty` — nobody backed the winning side, vs `creator_void`), with a refunds-open hint.
- **Test migration** (`src/lib/actions.test.ts`): the visibility matrix moved from the obsolete single-shot `status: "resolved"` model to the current `dispute_window` / `dispute_resolved` / `disputed` statuses with live `dispute_deadline` fixtures (future/past), covering window-open vs window-closed dispute and settle gating, the 2-round dispute limit, the fresh window after `resolve_dispute`, `add_source` hidden once sources are frozen, and settle blocked on an UNRESOLVED outcome. New helper coverage: `disputeWindowOpen` (status/deadline boundary), `disputeWindowRemaining`, `frozenSources`, `sourcesFrozen`, `voidReasonLabel`, `canVoid`. Unit suite 60 → 76.

## Reviewer fixes — resubmission

This resubmission addresses both points from the previous review. Tests: 76/76 (`vitest run`); production build passes (`next build`).

**1. Payable single-argument stake.** `stake(side)` is a single-argument payable call; the staked amount is passed only through the transaction `value` and must be strictly positive. The UI validates the amount before opening the wallet (`parseStakeWei`, `src/lib/actions.ts`) — empty, zero, negative and fractional inputs are rejected and never reach `writeContract`.

**2. Strict consensus-result gating.** The write path awaits an accepted receipt and verifies the execution result before touching state: `writeContract` -> `waitForTransactionReceipt` -> verify receipt status -> verify `txExecutionResult` -> only then re-read `get_state`. Success is accepted ONLY for `FINISHED` / `FINISHED_WITH_RETURN`. `FINISHED_WITH_ERROR`, `NOT_VOTED`, `UNDETERMINED`, `LEADER_TIMEOUT`, any `*_WITH_ERROR`, and unknown/absent results are treated as failure and shown in the UI — no optimistic success. The tx hash is kept on error. See `classifyExecution` / `SUCCESS_RESULTS` in `src/lib/genlayer.ts`.

### Deployed contracts (Testnet Bradbury)

| Contract | Address | Source |
| --- | --- | --- |
| Prediction Market | `0x3d17bD6d87563cB172E7C634341fBc8A14574035` | `apps/prediction-market/contracts/prediction_market.py` |
| Multi-Source Oracle | `0x2Ab508Bb9Be84ea4ea8388b9b8872017729a2C82` | `apps/multi-source-oracle/contracts/oracle.py` |
| Content Moderator | `0x235F51b11b9F96d6673df37553Ef58373c4324F9` | `apps/content-moderator/contracts/moderator.py` |

### On-chain proof — Prediction Market lifecycle

Deterministic (no-LLM) payable + gating run against a fresh PM instance `0x8D0c1f6b433f12a937081f7f1FbBDC3Fd51B41B1`:

| Action | Expected | Result | Tx |
| --- | --- | --- | --- |
| stake(value=0) | revert | FINISHED_WITH_ERROR | [tx](https://explorer-bradbury.genlayer.com/tx/0x397f21e174d5b59170c40108f4cc56ea842857c1b15cc21a39ee031d6af894df) |
| stake(YES, value>0) | recorded | FINISHED_WITH_RETURN | [tx](https://explorer-bradbury.genlayer.com/tx/0x90253b2970cd2d2ff0fd7b2451305b28af42590733969684d05e00f0e3311485) |
| claim before settle | revert | reverted | [tx](https://explorer-bradbury.genlayer.com/tx/0x3a77877ef6fb216b1f75ca6e2ec87d3ddb7330f2e4eca82a254f58a967f52ff6) |
| dispute before resolve | revert | reverted | [tx](https://explorer-bradbury.genlayer.com/tx/0x2080382c3c2952842022174fd3a8913e18a7ae43749c89eff847bef2ab94b5f4) |
| void | voided | FINISHED_WITH_RETURN | [tx](https://explorer-bradbury.genlayer.com/tx/0x34d63ce2d94767500458c2b8d66b2eee3df12e05a2a1863cbdcfb2b49b1e7b22) |
| refund 1:1 | payout=stake | FINISHED_WITH_RETURN | [tx](https://explorer-bradbury.genlayer.com/tx/0x89a8c4a523512ad31c088ba8ca35e2d7c446d68e2615f8b3c5f6ca6d5e128adb) |
| double refund | revert | reverted | [tx](https://explorer-bradbury.genlayer.com/tx/0xb14778bf16655213ad6fd6b8c497aca63d04bd6ab94875e0bb7473b6000193ef) |
| re-void | revert | reverted | [tx](https://explorer-bradbury.genlayer.com/tx/0xf32b0042e531bf49c7642a40fdb1b3bc5f807c7bf2414fe766c5d4eaa68774d9) |

Multi-Source Oracle `update`: [tx](https://explorer-bradbury.genlayer.com/tx/0x5c3f94b50f9dc8c705f12bec8b5d37fffc3e0ef379eb44b2402c366cf2258c72) (status 7 = FINALIZED). Content Moderator reads live (`appeal_outcome: UPHELD`).

### Verify locally

- `npm test` — 76/76
- `npm run build`
- `node tests/smoke.onchain.mjs`


Interactive multi-contract dApp on GenLayer Testnet Bradbury. A thin browser client that submits real inputs to three Intelligent Contracts and reads their on-chain state. Every consensus-critical decision (moderation verdicts, market outcomes, oracle values) is computed and stored on-chain by the contracts; the frontend never decides anything.

Live app: <https://artem1981777.github.io/genlayer-consensus-console/>

## Reviewer fixes -- round 2

Round-1 review by steward Gen. Dave raised three points; each is addressed below with the fix location and on-chain / test proof.

| # | Reviewer comment | Fix (file) | Proof |
| --- | --- | --- | --- |
| 1 | Dashboard omitted void/refund and gated claim/dispute only by phase | void() and refund() are now first-class UI actions; gating rewritten to check actual per-caller preconditions from get_state (claim: settled + winning stake > 0 + not yet claimed; dispute: resolved + caller staked + < 2 rounds + non-empty reason). Buttons disable with a tooltip reason instead of hiding. src/lib/actions.ts, src/lib/actions.test.ts (39 tests); tracked contract -> 0x3d17bD6d87563cB172E7C634341fBc8A14574035 | [void](https://explorer-bradbury.genlayer.com/tx/0x0723f61bf6ccc432517befb98e89170f040762867c6934f5a5ffdef01dc33026), [refund 1:1](https://explorer-bradbury.genlayer.com/tx/0x90d456a0204286248e10fd703548450a506ecaf3ab9c7ef00240b3850bf11d52); deterministic 8/8 payable suite |
| 2 | Oracle published leader-supplied provenance/count/spread without binding them to validator recomputation | After consensus every published field (success, decimals, median, spread_bps, sources_used, provenance) is re-derived from data each validator independently fetched and corroborated (>= 2 sources within tolerance); provenance is part of the compared result. apps/multi-source-oracle/contracts/oracle.py; redeployed -> 0x2Ab508Bb9Be84ea4ea8388b9b8872017729a2C82 | [update](https://explorer-bradbury.genlayer.com/tx/0x5c3f94b50f9dc8c705f12bec8b5d37fffc3e0ef379eb44b2402c366cf2258c72) (state carries provenance[] source->value, spread_bps=2, sources_used=3) |
| 3 | Behavioral scripts used obsolete dispute and moderation transitions | Every .mjs aligned to current constructors and state machines (PM resolve->dispute->resolve_dispute->settle->claim plus void/refund; moderator moderate->enforce->appeal->resolve_appeal) with added coverage: void+refund happy path, refund anti-double, claim/dispute gating, full appeal cycle. apps/prediction-market/test.mjs, apps/prediction-market/test-payable.mjs, apps/content-moderator/test.mjs | deterministic 8/8 payable/gating suite green; lifecycle + appeal-cycle scripts run vs fresh Bradbury contracts |

## Intelligent Contracts

### Content Moderator
Source: apps/content-moderator/contracts/moderator.py

Validators reason over a natural-language policy via a custom equivalence-principle prompt and produce an on-chain verdict with category, confidence and rationale.

- moderate(): open to any caller while status is pending
- enforce(): creator only, after moderation
- appeal(note): content author only, when a FLAG or REMOVE verdict is enforced
- resolve_appeal(): creator only, on an appealed case

### Prediction Market
Source: apps/prediction-market/contracts/prediction_market.py

- stake(side): payable; takes ONE side argument (YES or NO) and requires a strictly positive value
- add_source(url): creator only, while open and before the first stake — the first stake freezes the source set and market config (question + rules + sources) on-chain for the rest of the lifecycle
- resolve(): creator only; resolves from cited web sources; a YES/NO outcome opens a mandatory time-based dispute window (`dispute_deadline = resolve_time + dispute_window_seconds`)
- dispute(reason): gated — only while the dispute window is open (status `dispute_window` / `dispute_resolved`, before `dispute_deadline`), non-empty reason, and the caller must actually hold a stake in this market; max 2 dispute rounds
- resolve_dispute(): creator only, on a disputed market; every resolution event (initial or post-dispute) opens a fresh dispute window so an overturned outcome can still be contested
- settle(): creator only; after the dispute window has closed, with a definite YES or NO outcome; if nobody backed the winning side the market auto-voids and refunds open
- void(): creator only; while status is open / dispute_window / dispute_resolved and the outcome is not a definite YES/NO -> moves the market to voided with an on-chain reason (`creator_void` or `winning_side_empty`)
- claim(): gated — settled market only, requires the caller's winning stake > 0, pays a pari-mutuel payout, single-use (anti-double-claim)
- refund(): voided market only; returns each staker's full position 1:1 via emit_transfer(value=u256(...), on="finalized"), single-use (anti-double-refund)

### Multi-Source Oracle
Source: apps/multi-source-oracle/contracts/oracle.py

- update(key): public; aggregates a median BTC/USD from 3 independent sources (Coinbase, CoinGecko, Kraken). Every publication-critical field — success flag, decimals, spread (bps), source count and sample provenance — is validator-checked or derived only from validated data, so nothing is published unless the validators independently agree. Deterministic, no LLM. Guards: tolerance 100 bps, max spread 500 bps
- register_feed / remove_feed: owner only

## Live contracts (Testnet Bradbury)

- Prediction Market: 0x3d17bD6d87563cB172E7C634341fBc8A14574035
- Content Moderator: 0xc87881c7223e1d47Bf13EBDC50ADFaA0d0EFC4dC
- Content Moderator (portal-registered revision): 0x235f51b11b9f96d6673df37553ef58373c4324f9
- Multi-Source Oracle: 0x2Ab508Bb9Be84ea4ea8388b9b8872017729a2C82
- AI Escrow Arbiter (bonus demo — not part of this submission): 0x6f33FF874366aEd9B071505Ffa1057072b8FC37C

## Write lifecycle

Every action follows the same strict path in src/lib/genlayer.ts:

1. writeContract with functionName, args and value
2. await waitForTransactionReceipt with status ACCEPTED
3. verify the execution result is FINISHED or FINISHED_WITH_RETURN, and throw on any *ERROR* / NOT_VOTED / UNDETERMINED
4. only then re-read get_state with stateStatus accepted

Transient network, capacity and rate-limit errors are softened to a retriable Network busy, tap again message; execution errors are never hidden.

## Role- and phase-aware actions

Action buttons render only when the action is actually executable for the connected wallet in the current contract phase (creator-only, author-only and phase gates). A reviewer never sees a dead button or an error toast. The gating logic is a pure module: src/lib/actions.ts.

## Tech stack

- Next.js 15 (static export) + React 19
- genlayer-js + viem, EIP-6963 wallet discovery
- Tailwind CSS 4
- Deployed to GitHub Pages (gh-pages branch)

## Tests

76 unit tests, no mocks (vitest):

- src/lib/actions.test.ts: 58 unit tests for role/phase visibility across the current dispute-window lifecycle (dispute_window / dispute_resolved / disputed statuses with live dispute_deadline fixtures), per-caller claim/dispute/settle gating (incl. non-empty dispute reason, dispute-window open/closed boundary, 2-round dispute limit, add_source freeze gating and shared-claims refund guard), whyNot messages, and the dispute-window / freeze / void helper suite (disputeWindowOpen, disputeWindowRemaining, frozenSources, sourcesFrozen, voidReasonLabel, canVoid)
- src/lib/projects.test.ts and src/lib/store.test.ts: config and tracked-contract store
- src/lib/genlayer.test.ts and src/lib/live-moderator.test.ts: live get_state reads against deployed contracts

Deterministic on-chain payable + gating tests (no LLM): apps/prediction-market/test-payable.mjs — 8 checks: zero-value stake reverts, claim-before-settle reverts, dispute-before-resolve reverts, payable stake recorded, void (open -> voided), refund 1:1, double-refund reverts, re-void reverts.

Run: npm install, then npm test, then npm run build

## On-chain proof

Payable path (stake -> void -> refund, 1:1):
- Stake (payable, positive value): <https://explorer-bradbury.genlayer.com/tx/0x6e60e4b9fb093010c6df26873f6e31b38f692bd1c033a47f33212be72cb4c0c6>
- Void (open -> voided): <https://explorer-bradbury.genlayer.com/tx/0x0723f61bf6ccc432517befb98e89170f040762867c6934f5a5ffdef01dc33026>
- Refund (payout == stake): <https://explorer-bradbury.genlayer.com/tx/0x90d456a0204286248e10fd703548450a506ecaf3ab9c7ef00240b3850bf11d52>

Oracle:
- Update (hardened, btc_usd=78213.9, 3 sources, spread 2 bps; provenance bound to validator recomputation): <https://explorer-bradbury.genlayer.com/tx/0x5c3f94b50f9dc8c705f12bec8b5d37fffc3e0ef379eb44b2402c366cf2258c72>

Deployments:
- Prediction Market deploy (fresh, void/refund + gating): <https://explorer-bradbury.genlayer.com/tx/0xb7406f6a8788600e04d1a6bdc1200269f2665683c97b9d9e338450ca6a815063>
- Multi-Source Oracle deploy (hardened): <https://explorer-bradbury.genlayer.com/tx/0x75446ed8583355ad8b6738d3e4e3d03296049fb7c3c1a05825d3e8979dc0d20c>
- Oracle register_feed (btc_usd, 3 sources): <https://explorer-bradbury.genlayer.com/tx/0xc3d01a735038c563162e6b345c6e7a18c71ce4d8100fd0b9a37aa84a7962f652>
- Content Moderator deploy: <https://explorer-bradbury.genlayer.com/tx/0xa05d3619563ce7ca31f01b34f3f82f89e868c4a4131d5896513339ec6f001867>


## AI Escrow Arbiter (bonus demo — not part of this submission)

Not one of the three claimed Intelligent Contracts in this submission — included only as an optional in-browser demo. Interactive AI-adjudicated escrow, available in the dashboard at the /escrow route.

Live dApp: <https://artem1981777.github.io/genlayer-consensus-console/escrow/>
Contract source: embedded in src/lib/escrow.ts (ESCROW_SOURCE), deployed fresh from the browser per escrow.

Instead of a human middleman, a validator-consensed AI decides whether held funds are released to the seller or refunded to the buyer, based on the escrow terms and the evidence submitted on-chain. The frontend is a full Web3 dApp: EIP-6963 wallet connection, automatic network switch to Testnet Bradbury, browser deployment, funding, evidence submission, AI resolution and payout — every step an on-chain transaction.

Contract methods:
- __init__(seller, amount_wei, terms): the deployer becomes the buyer
- fund(): payable, buyer only, requires value == amount; CREATED -> FUNDED
- submit_evidence(content): buyer or seller, append-only, while FUNDED
- resolve(): runs the AI arbiter; validators reach consensus on a RELEASE or REFUND verdict with a written reason; FUNDED -> RESOLVED
- payout(): releases held funds to the seller (RELEASE) or buyer (REFUND); replay-safe; RESOLVED -> PAID
- get_state / get_status / get_evidence: read-only views

Lifecycle: CREATED -> fund -> FUNDED -> submit evidence -> resolve (AI verdict) -> RESOLVED -> payout -> PAID.

How to use: connect a wallet, click "Create escrow (deploy)", then fund -> submit evidence -> resolve (AI) -> payout. Transient AI-consensus reverts on testnet are retried automatically, and the action buttons never lock up.

### Live escrow contracts (Testnet Bradbury)
- Portal-registered escrow: 0x6f33FF874366aEd9B071505Ffa1057072b8FC37C
- Demo escrow (full-cycle run): 0xf1f03acdC836d7A5747C87A280f04b0bC63c3457

### On-chain proof (full lifecycle, all accepted)
- Deploy: <https://explorer-bradbury.genlayer.com/tx/0x941a8ce197d15fa21fc04c86039c061f63c42129a388ec515c85f707d3afcecb>
- Fund: <https://explorer-bradbury.genlayer.com/tx/0x4312b3564f114952d95c6e28724748130b33c3d16103383fa2187e48f8877b4d>
- Evidence: <https://explorer-bradbury.genlayer.com/tx/0x95e04ee1053836ac43c5e0e110faa8ab57b97774741b08fd8c01590c1535cdcd>
- Resolve (AI verdict): <https://explorer-bradbury.genlayer.com/tx/0x20972b579e6be3b7684951ee542ed99a2d851ee8a1fb05e17ff71890afbe842d>
- Payout (PAID): <https://explorer-bradbury.genlayer.com/tx/0x3de6b50ec807f43a569c29c870a273f5658b41cf9cdad4f5c3e454df65e74ba7>

## Changelog

### v1.4.0 — Dispute-window & market-lifecycle UI (2026-09-04)
- New live DisputeCountdown component (src/components/dispute-countdown.tsx): per-second countdown against the on-chain dispute_deadline, elapsed progress bar, warn under 5 min, closed-state tag when the window expires; renders nothing outside dispute_window / dispute_resolved.
- Case panel (src/components/case-panel.tsx): sources panel with freeze state (frozen set + config hash after the first stake), void-reason banner (winning_side_empty vs creator_void), countdown wiring; unused imports removed.
- Tests (src/lib/actions.test.ts): visibility matrix migrated to the current dispute_window / dispute_resolved / disputed lifecycle with future/past dispute_deadline fixtures; new helper coverage (disputeWindowOpen, disputeWindowRemaining, frozenSources, sourcesFrozen, voidReasonLabel, canVoid). Unit suite 60 -> 76; next build verified.

### Round 2 (reviewer resubmission)
- Prediction Market: void() and refund() surfaced as real UI actions; claim/dispute gating rewritten to per-caller on-chain preconditions with disabled + tooltip buttons (src/lib/actions.ts, 39 unit tests). Tracked contract redeployed -> 0x3d17bD6d87563cB172E7C634341fBc8A14574035.
- Multi-Source Oracle: update() hardened so every published field is re-derived from validator-corroborated data with provenance bound into the compared result. Redeployed -> 0x2Ab508Bb9Be84ea4ea8388b9b8872017729a2C82; btc_usd feed re-registered.
- Scripts: all .mjs aligned to current constructors and state machines; added void/refund, anti-double, claim/dispute gating and full appeal-cycle coverage. Deterministic payable/gating suite 8/8.
- Reviewer nits: dispute now requires a non-empty reason in the UI (validated before submit, mirroring the on-chain assert len(reason.strip()) > 0); refund double-spend gating made explicit via alreadyRefunded over the shared on-chain claims map; unit suite 52 -> 54.

## Reviewer fixes — action → source → proof matrix

Every advertised write action maps to committed contract source and a real Testnet Bradbury transaction. Prediction Market lifecycle was exercised deterministically (no LLM) against a dedicated test instance `0x8D0c1f6b433f12a937081f7f1FbBDC3Fd51B41B1`; the production PM is `0x3d17bD6d87563cB172E7C634341fBc8A14574035`.

| Action | Source file | Contract address | Proof transaction | Result |
| --- | --- | --- | --- | --- |
| stake (zero-value, rejected) | apps/prediction-market/contracts/prediction_market.py | 0x8D0c1f6b433f12a937081f7f1FbBDC3Fd51B41B1 | https://explorer-bradbury.genlayer.com/tx/0x397f21e174d5b59170c40108f4cc56ea842857c1b15cc21a39ee031d6af894df | FINISHED_WITH_ERROR (expected reject) |
| stake (YES, value>0) | apps/prediction-market/contracts/prediction_market.py | 0x8D0c1f6b433f12a937081f7f1FbBDC3Fd51B41B1 | https://explorer-bradbury.genlayer.com/tx/0x90253b2970cd2d2ff0fd7b2451305b28af42590733969684d05e00f0e3311485 | FINISHED_WITH_RETURN |
| claim (before settle, gated) | apps/prediction-market/contracts/prediction_market.py | 0x8D0c1f6b433f12a937081f7f1FbBDC3Fd51B41B1 | https://explorer-bradbury.genlayer.com/tx/0x3a77877ef6fb216b1f75ca6e2ec87d3ddb7330f2e4eca82a254f58a967f52ff6 | reverted (expected) |
| dispute (before resolve, gated) | apps/prediction-market/contracts/prediction_market.py | 0x8D0c1f6b433f12a937081f7f1FbBDC3Fd51B41B1 | https://explorer-bradbury.genlayer.com/tx/0x2080382c3c2952842022174fd3a8913e18a7ae43749c89eff847bef2ab94b5f4 | reverted (expected) |
| void | apps/prediction-market/contracts/prediction_market.py | 0x8D0c1f6b433f12a937081f7f1FbBDC3Fd51B41B1 | https://explorer-bradbury.genlayer.com/tx/0x34d63ce2d94767500458c2b8d66b2eee3df12e05a2a1863cbdcfb2b49b1e7b22 | FINISHED_WITH_RETURN |
| refund (1:1) | apps/prediction-market/contracts/prediction_market.py | 0x8D0c1f6b433f12a937081f7f1FbBDC3Fd51B41B1 | https://explorer-bradbury.genlayer.com/tx/0x89a8c4a523512ad31c088ba8ca35e2d7c446d68e2615f8b3c5f6ca6d5e128adb | FINISHED_WITH_RETURN |
| refund (double, gated) | apps/prediction-market/contracts/prediction_market.py | 0x8D0c1f6b433f12a937081f7f1FbBDC3Fd51B41B1 | https://explorer-bradbury.genlayer.com/tx/0xb14778bf16655213ad6fd6b8c497aca63d04bd6ab94875e0bb7473b6000193ef | reverted (expected) |
| void (re-void, gated) | apps/prediction-market/contracts/prediction_market.py | 0x8D0c1f6b433f12a937081f7f1FbBDC3Fd51B41B1 | https://explorer-bradbury.genlayer.com/tx/0xf32b0042e531bf49c7642a40fdb1b3bc5f807c7bf2414fe766c5d4eaa68774d9 | reverted (expected) |
| update (oracle) | apps/multi-source-oracle/contracts/oracle.py | 0x2Ab508Bb9Be84ea4ea8388b9b8872017729a2C82 | https://explorer-bradbury.genlayer.com/tx/0x5c3f94b50f9dc8c705f12bec8b5d37fffc3e0ef379eb44b2402c366cf2258c72 | FINALIZED (status 7) |
| moderate | apps/content-moderator/contracts/moderator.py | 0x235F51b11b9F96d6673df37553Ef58373c4324F9 | https://explorer-bradbury.genlayer.com/tx/0x2dfc598349349a8cc69cf774ff8c07d95bfc9de3399a9a75f9faea022fc0f06c | REMOVE |
| enforce | apps/content-moderator/contracts/moderator.py | 0x235F51b11b9F96d6673df37553Ef58373c4324F9 | https://explorer-bradbury.genlayer.com/tx/0x50cd96099418f555d91b4e4d27288902940a1b7793780bb96a50dc434cb5bde4 | blocked |
| appeal | apps/content-moderator/contracts/moderator.py | 0x235F51b11b9F96d6673df37553Ef58373c4324F9 | https://explorer-bradbury.genlayer.com/tx/0x8578d3e39d485c106d7e33ea35aa74793b441545ca9be70f09a4227219652e79 | recorded |
| resolve_appeal | apps/content-moderator/contracts/moderator.py | 0x235F51b11b9F96d6673df37553Ef58373c4324F9 | https://explorer-bradbury.genlayer.com/tx/0x14fa4e5b4bfdd1eb488c31b2894391d5f65d2459e806112133f51c047e4513c5 | UPHELD |

## Known limitations

- `gen_getContractSchema` on Bradbury currently returns `VMError: invalid_contract absent_runner_comment`, so machine-readable schemas are not attached; action-to-source parity is proven by committed contract sources plus the real on-chain executions above.
- GenLayer-js does not emit a bare `FINISHED` in practice — successful writes surface as `FINISHED_WITH_RETURN`. The gate accepts both; the bare `FINISHED` case is covered by unit tests.
- `create_item`, `ingest`, `fund_pool`, `reverify_source` are contract/maintenance methods not surfaced as user write-actions in this dApp UI, so they are out of scope for the UI lifecycle gate (not reproduced as UI transactions).
- PM lifecycle proofs ran against a dedicated test instance (`0x8D0c…41B1`) to keep production market state clean; the production PM is `0x3d17…4035`.
