# Review response — submission 710849D6 (GenLayer Consensus Console)

Steward request (Pavel Kolosov, Aug 25, 2026):

> "Please either add the oracle and prediction contract source that implements every
> advertised action, or remove the unsupported actions and claims. Also await and verify
> an accepted transaction receipt before refreshing state so the checked-in app matches
> the contract lifecycle."

Both points are addressed. Full evidence pack: [`docs/EVIDENCE.md`](./EVIDENCE.md).

## Point 1 — Contract source for every advertised action

Every advertised action now maps to committed contract source, a deployed contract on
Testnet Bradbury, and a real transaction:

- **Prediction Market** — `apps/prediction-market/contracts/prediction_market.py`:
  `stake` (payable, single `side` argument, positive value), `resolve`, `dispute`,
  `resolve_dispute`, `settle`, `claim`, plus `void`/`refund` and `add_source`.
  Deployed at `0x3d17bD6d87563cB172E7C634341fBc8A14574035`.
- **Multi-Source Oracle** — `apps/multi-source-oracle/contracts/oracle.py`:
  `update(key)` (median-consensus BTC/USD from Coinbase, CoinGecko, Kraken with
  tolerance and max-spread guards), `register_feed`, `remove_feed`.
  Deployed at `0x2Ab508Bb9Be84ea4ea8388b9b8872017729a2C82`.
- **Content Moderator** — `apps/content-moderator/contracts/moderator.py`:
  `moderate`, `enforce`, `appeal`, `resolve_appeal`.
  Deployed at `0x235F51b11b9F96d6673df37553Ef58373c4324F9`.

Per-action proof transactions (explorer links) are tabulated in
[`docs/EVIDENCE.md` §2](./EVIDENCE.md#2-action--source--deployment--transaction-matrix).
No advertised action lacks source or an on-chain execution; no unsupported claims remain.

## Point 2 — Await and verify an accepted receipt before refreshing state

The single write path used by every action (`src/lib/genlayer.ts`, `sendWriteEx`):

1. `writeContract({ address, functionName, args, value })`
2. `await waitForTransactionReceipt({ hash, status: TransactionStatus.ACCEPTED, interval: 3000, retries: 8 })`
   via the direct RPC read client (never the wallet provider)
3. Strict execution-result allowlist — success is **only** `FINISHED` or
   `FINISHED_WITH_RETURN` (`SUCCESS_RESULTS` / `classifyExecution`); `FINISHED_WITH_ERROR`,
   `NOT_VOTED`, `UNDETERMINED`, `LEADER_TIMEOUT` and anything else are surfaced as errors
   with the tx hash preserved
4. Only then does the UI re-read `get_state` (`stateStatus: "accepted"`)

On-chain proof the gate matches reality: a zero-value `stake` fails on-chain with
`FINISHED_WITH_ERROR` and is reported as failure
([tx](https://explorer-bradbury.genlayer.com/tx/0x397f21e174d5b59170c40108f4cc56ea842857c1b15cc21a39ee031d6af894df));
a valid payable `stake` returns `FINISHED_WITH_RETURN` and only then refreshes state
([tx](https://explorer-bradbury.genlayer.com/tx/0x90253b2970cd2d2ff0fd7b2451305b28af42590733969684d05e00f0e3311485)).

## Verification

- `npm test` — 76/76 unit tests pass (no mocks), including `classifyExecution`
  (success/failure/pending) and `parseStakeWei` (zero/negative/fractional rejected
  before `writeContract`)
- `npx tsc --noEmit` — clean
- `npm run build` — production build passes
- `node tests/smoke.onchain.mjs` — live `get_state` reads succeed against all three
  deployed contracts (Content Moderator, Prediction Market, Multi-Source Oracle)

## Note on `genlayer schema`

`gen_getContractSchema` on Bradbury currently returns
`VMError: invalid_contract absent_runner_comment`, so machine-readable schemas cannot be
attached. Action-to-source parity is instead proven by the committed contract sources
plus the real on-chain executions listed in the evidence pack.
