# Changelog

## v1.4.0 — Dispute-window & market-lifecycle UI — 2026-09-04

### Added
- **Live dispute-window countdown** (`src/components/dispute-countdown.tsx`): ticks every second against the on-chain `dispute_deadline` (epoch seconds stored by `resolve()` / `resolve_dispute()`), shows % elapsed, an elapsed progress bar, warn color under 5 minutes, the exact local time settlement unlocks, and flips to a "window closed · outcome final · settlement unlocked" tag the moment the deadline passes. Renders nothing outside `dispute_window` / `dispute_resolved` statuses.
- **Sources panel with freeze state** (`src/components/case-panel.tsx`): market sources render as clickable external links; after the first stake the panel shows the frozen source set (`frozen_sources`), a "frozen · config locked" tag, and the truncated `frozen_config_hash` proving the config snapshot.
- **Void reason banner** (`src/components/case-panel.tsx`): voided markets surface a human-readable reason derived from on-chain `void_reason` (`winning_side_empty` vs `creator_void`), with refunds-open hint.

### Fixed
- **Broken build**: `case-panel.tsx` imported `./dispute-countdown` before the component existed; removed unused `windowOpen` / `disputeWindowOpen` / `disputeWindowRemaining` imports from the panel (logic lives in the countdown component).
- **Stale tests** (`src/lib/actions.test.ts`): migrated the visibility matrix from the old single-shot `status: "resolved"` lifecycle to the current `dispute_window` / `dispute_resolved` / `disputed` statuses with live `dispute_deadline` fixtures (future/past), including: window-open vs window-closed dispute and settle gating, dispute-limit, fresh window after `resolve_dispute`, `add_source` hidden when sources are frozen, settle blocked on UNRESOLVED outcome.

### Tests / build
- 76/76 passing (`vitest run`, up from 60); production build passes (`next build`).
- New coverage: `disputeDeadline`, `disputeWindowSeconds`, `disputeWindowOpen` (status/deadline boundary), `disputeWindowRemaining`, `frozenSources` (JSON parse + garbage), `sourcesFrozen` (strict boolean), `voidReasonLabel` (both reasons + non-void), `canVoid` (definite-outcome gating), plus 10 new visibility cases.

## v1.3.0 — Reviewer fixes (resubmission) — 2026-08-31

### Patch matrix

| Patch | File | Commit | Proof tx | Explorer link |
| --- | --- | --- | --- | --- |
| Receipt result hardening | src/lib/genlayer.ts | v1.3.0 | 0x397f21e1 | https://explorer-bradbury.genlayer.com/tx/0x397f21e174d5b59170c40108f4cc56ea842857c1b15cc21a39ee031d6af894df |
| Stake signature/value fix | src/lib/actions.ts | v1.3.0 | 0x90253b29 | https://explorer-bradbury.genlayer.com/tx/0x90253b2970cd2d2ff0fd7b2451305b28af42590733969684d05e00f0e3311485 |
| Zero-value validation | src/lib/actions.ts | v1.3.0 | 0x397f21e1 | https://explorer-bradbury.genlayer.com/tx/0x397f21e174d5b59170c40108f4cc56ea842857c1b15cc21a39ee031d6af894df |
| State refresh after execution result | src/lib/genlayer.ts, src/components/actions-panel.tsx | v1.3.0 | 0x34d63ce2 | https://explorer-bradbury.genlayer.com/tx/0x34d63ce2d94767500458c2b8d66b2eee3df12e05a2a1863cbdcfb2b49b1e7b22 |
| Address synchronization | tests/smoke.onchain.mjs, apps/prediction-market/index.html, probe.mjs | v1.3.0 | 0x5c3f94b5 | https://explorer-bradbury.genlayer.com/tx/0x5c3f94b50f9dc8c705f12bec8b5d37fffc3e0ef379eb44b2402c366cf2258c72 |
| README/evidence correction | README.md, CHANGELOG.md | v1.3.0 | 0x2dfc5983 | https://explorer-bradbury.genlayer.com/tx/0x2dfc598349349a8cc69cf774ff8c07d95bfc9de3399a9a75f9faea022fc0f06c |

### Fixed
- **Strict consensus-result gating** (`src/lib/genlayer.ts`): success is accepted ONLY for `FINISHED` / `FINISHED_WITH_RETURN`. `FINISHED_WITH_ERROR`, `NOT_VOTED`, `UNDETERMINED`, `LEADER_TIMEOUT`, any `*_WITH_ERROR`, and unknown/absent results are treated as failure. No optimistic UI; the tx hash is preserved on error. Added `classifyExecution()` and `SUCCESS_RESULTS`.
- **Payable single-argument stake validated before wallet** (`src/lib/actions.ts`): `parseStakeWei()` rejects empty / zero / negative / fractional amounts before `writeContract`. `stake(side)` is a single-argument payable call; the amount is passed only via tx `value` (> 0).
- **Escrow lifecycle** (`src/app/escrow/page.tsx`): `PENDING` is no longer labeled as confirmed.
- **Address consistency**: `tests/smoke.onchain.mjs` now targets the current Prediction Market `0x3d17bD6d87563cB172E7C634341fBc8A14574035` (was stale `0x72f6...`).

### Tests / build
- 60/60 passing (`vitest run`); production build passes (`next build`).
- New unit tests: `classifyExecution` (success/failure/pending), `parseStakeWei`, `stake.validate`, `stake.value`.

### On-chain proof (Testnet Bradbury, PM instance 0x8D0c1f6b433f12a937081f7f1FbBDC3Fd51B41B1)
| Action | Expected | Result | Tx |
| --- | --- | --- | --- |
| stake(value=0) | revert | FINISHED_WITH_ERROR | https://explorer-bradbury.genlayer.com/tx/0x397f21e174d5b59170c40108f4cc56ea842857c1b15cc21a39ee031d6af894df |
| stake(YES, value>0) | recorded | FINISHED_WITH_RETURN | https://explorer-bradbury.genlayer.com/tx/0x90253b2970cd2d2ff0fd7b2451305b28af42590733969684d05e00f0e3311485 |
| claim before settle | revert | reverted | https://explorer-bradbury.genlayer.com/tx/0x3a77877ef6fb216b1f75ca6e2ec87d3ddb7330f2e4eca82a254f58a967f52ff6 |
| dispute before resolve | revert | reverted | https://explorer-bradbury.genlayer.com/tx/0x2080382c3c2952842022174fd3a8913e18a7ae43749c89eff847bef2ab94b5f4 |
| void | voided | FINISHED_WITH_RETURN | https://explorer-bradbury.genlayer.com/tx/0x34d63ce2d94767500458c2b8d66b2eee3df12e05a2a1863cbdcfb2b49b1e7b22 |
| refund 1:1 | payout=stake | FINISHED_WITH_RETURN | https://explorer-bradbury.genlayer.com/tx/0x89a8c4a523512ad31c088ba8ca35e2d7c446d68e2615f8b3c5f6ca6d5e128adb |
| double refund | revert | reverted | https://explorer-bradbury.genlayer.com/tx/0xb14778bf16655213ad6fd6b8c497aca63d04bd6ab94875e0bb7473b6000193ef |
| re-void | revert | reverted | https://explorer-bradbury.genlayer.com/tx/0xf32b0042e531bf49c7642a40fdb1b3bc5f807c7bf2414fe766c5d4eaa68774d9 |

Multi-Source Oracle `update`: https://explorer-bradbury.genlayer.com/tx/0x5c3f94b50f9dc8c705f12bec8b5d37fffc3e0ef379eb44b2402c366cf2258c72 (status 7 = FINALIZED).

### Deployed addresses
- Prediction Market: `0x3d17bD6d87563cB172E7C634341fBc8A14574035`
- Multi-Source Oracle: `0x2Ab508Bb9Be84ea4ea8388b9b8872017729a2C82`
- Content Moderator: `0x235F51b11b9F96d6673df37553Ef58373c4324F9`
