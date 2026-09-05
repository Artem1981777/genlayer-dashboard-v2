# Multi-Source Oracle — Intelligent Contract

A reusable, source-grounded numeric oracle for GenLayer. It publishes a
median value (e.g. BTC/USD) aggregated from multiple independent web sources,
with every publication-critical field bound to independent validator
recomputation.

- Contract: [`contracts/oracle.py`](contracts/oracle.py)
- Offline consensus simulation (20 checks): [`sim_consensus.py`](sim_consensus.py)
- Deploy / register / update scripts: [`deploy-relay.mjs`](deploy-relay.mjs) (or [`deploy.mjs`](deploy.mjs) on an unrestricted network), [`register.mjs`](register.mjs), [`update.mjs`](update.mjs)

## Why this contract exists

On-chain applications need trustworthy external data. A single-source oracle
can be wrong (outage, manipulation, API change). This contract aggregates
several independent public APIs, rejects outliers, and only publishes a value
when GenLayer validators **independently recompute the exact same outcome**
from their own fetches. If they cannot, nothing is published (fail-safe).

## Consensus design (v2 — exact-value binding)

`update(key)` runs a custom non-deterministic block:

```python
raw = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
```

**Leader** — fetches every configured source via `gl.nondet.web.get(url)`,
extracts one number per source (`_extract_number`), and deterministically
derives the full outcome (`_derive_result`):

| Field | Meaning |
| --- | --- |
| `ok` | acceptance flag: `n >= 2` and `spread_bps <= max_spread_bps` |
| `median_units` | canonical integer median: `int(round(median * 10**decimals))` |
| `spread_bps` | inlier spread in basis points after single-outlier rejection |
| `sources_used` | number of sources that returned a usable positive number |
| `provenance` | `{source, value}` pairs the outcome was derived from |

**Validator** — accepts the leader's result only if ALL of the following hold:

1. **Claims bound to evidence.** The leader's stated outcome must be exactly
   the deterministic recomputation from the leader's *own* provenance — the
   leader cannot state an outcome its data does not support.
2. **Independent recomputation.** The validator re-fetches all sources itself
   and re-derives its own full outcome from its own data.
3. **Exact match, no ranges.** The validator's outcome must equal the
   leader's outcome on **every** field — `ok`, `median_units`, `spread_bps`,
   `sources_used`, `decimals` — with plain integer equality. There is
   deliberately **no tolerance band on the median**: the integer the
   validators verify is bit-for-bit the integer the contract persists.
4. **Per-source liveness corroboration.** Every source the leader reported
   must be present in the validator's own fetch and agree within
   `tolerance_bps`. This check can only *reject*; it never widens the set of
   acceptable medians.
5. **Fail-safe.** A failure outcome (`ok=False`) is accepted only when the
   validator's independent recomputation failed *identically*; the contract
   then refuses to publish any value.

**Post-consensus (deterministic)** — the contract re-derives the canonical
outcome from the consensus provenance, asserts it equals the verified outcome
field-by-field, asserts `ok`, and persists exactly that `median_units` (plus
samples, provenance, spread, round number). Storage is written only after
consensus.

### What changed vs. the rejected revision (reviewer response)

| Reviewer complaint | Fix | Status |
| --- | --- | --- |
| "Validator still accepts a range of median integers while the leader's exact integer is stored" | The tolerance-based median comparison (`abs(lu - vu) * 10000 <= tolerance_bps * abs(lu)`) was **removed**. The validator's recomputed `median_units` must equal the leader's exactly. | done, proven by sim T2 |
| "Does not require the validator's independently recomputed success/spread result to match" | The validator now re-derives the **full outcome** from its own fetch and requires exact equality on `ok`, `median_units`, `spread_bps`, `sources_used`, `decimals`. | done, proven by sim T1–T8 |
| "The submitted revision also fails GenVM lint" | The `gl.nondet.web.get` call was moved into a module-level helper `_fetch_provenance(sources)` so it is statically reachable from the `run_nondet_unsafe` leader/validator entry points (lint rule E010). `genvm-linter` 0.11.0 now reports **0 issues**. | done, re-verified locally |
| "The supplied Explorer deployment is the older implementation" | A byte-for-byte parity check (`verify-relay.mjs`, see below) **confirmed** the reviewer: the contract at `0x2Ab5…2C82` is the older v1 implementation (11,895 bytes vs. 14,343 bytes local). A fresh deployment of this exact v2 source is pending — see "Deployment status". | parity check done; redeploy pending |

`tolerance_bps` is still a feed parameter, but its role changed: it is now
only a per-source liveness corroboration bound (a source that stops being
served, or drifts beyond `tolerance_bps` between the leader's and validator's
fetches, causes rejection). It no longer defines an acceptance range for the
median.

## Feed configuration

Feeds are registered by the owner:

```python
register_feed(
    key,             # e.g. "btc_usd"
    question,        # human-readable description
    sources_json,    # JSON array of >= 2 http(s) URLs
    tolerance_bps,   # per-source liveness corroboration bound (0..10000)
    max_spread_bps,  # max inlier spread for ok=True (0..10000)
    decimals,        # canonical integer scaling (0..18)
)
```

The live `btc_usd` feed uses Coinbase, CoinGecko and Kraken with
`tolerance_bps=100`, `max_spread_bps=500`, `decimals=2`.

`_extract_number` understands three JSON shapes out of the box:

| Source | Endpoint | Shape |
| --- | --- | --- |
| Coinbase | `/v2/prices/BTC-USD/spot` | `{"data": {"amount": "..."}}` |
| CoinGecko | `/api/v3/simple/price?ids=bitcoin&vs_currencies=usd` | `{"bitcoin": {"usd": ...}}` |
| Kraken | `/0/public/Ticker?pair=XBTUSD` | `{"result": {PAIR: {"c": ["...", ...]}}}` |

## Contract API

| Method | Type | Caller | Effect |
| --- | --- | --- | --- |
| `__init__()` | deploy | — | owner = deployer |
| `register_feed(key, question, sources_json, tolerance_bps, max_spread_bps, decimals)` | write | owner only | configures a feed (≥ 2 http(s) sources) |
| `remove_feed(key)` | write | owner only | deletes a feed and its value |
| `update(key)` | write | anyone | runs exact-value median consensus; publishes value + provenance |
| `get_state()` | view | — | feeds, values, history |
| `get(key)` / `get_value(key)` / `get_feed(key)` / `list_feeds()` | view | — | feed/value reads |
| `is_stale(key, max_age_rounds)` | view | — | staleness check |

## Verification

### 1. GenVM lint (0 issues)

```bash
pip install genvm-linter
python -c "from genvm_linter.linter import GenVMLinter; \
  src=open('contracts/oracle.py',encoding='utf-8').read(); \
  print(list(GenVMLinter().lint_source(src,'oracle.py')))"
# -> []
```

### 2. Offline consensus simulation (20 checks)

```bash
python sim_consensus.py
```

The harness loads the **real contract source**, mocks the `genlayer` runtime,
and drives the exact leader/validator functions `update()` passes to
`run_nondet_unsafe`:

| Test | Scenario | Expected |
| --- | --- | --- |
| T1 | identical node views | accepted; exact `median_units` persisted |
| T2 | validator median differs but stays inside the OLD tolerance band | **rejected** (regression proof: the old formula would have accepted it) |
| T3 | leader claims a median its provenance does not support | rejected |
| T4 | leader reports an unknown source URL | rejected |
| T5 | sources disagree beyond `max_spread_bps` for every node | failure verified identically; nothing published |
| T6 | validator independently sees only 2 of 3 sources | rejected (outcome changed) |
| T7 | two-source feed (even sample count) | accepted; averaged median exact |
| T8 | benign per-source noise that leaves the outcome unchanged | accepted (strict but not brittle) |

### 3. On-chain verification (parity check)

The local network sits behind DPI that resets large TCP requests and stalls
large responses to `rpc-bradbury.genlayer.com` (requests > ~1 KB get RST;
responses > ~1 KB stall at ~0.8–1.4 KB). Node's `fetch` and `curl` both fail.
Browsers, however, negotiate HTTP/3 (QUIC over UDP) through Cloudflare and are
unaffected, and the RPC endpoint sends `access-control-allow-origin: *` — so
all verification and deployment traffic is tunneled through a local browser
tab acting as an RPC relay:

- [`verify-relay.mjs`](verify-relay.mjs) — byte-for-byte parity check.
  `node verify-relay.mjs`, then open <http://localhost:8899/> in a browser
  (Chrome/Edge). The page fetches the deployed contract's full calldata via
  QUIC, the server RLP-decodes it and compares `[code, constructorArgs,
  leaderOnly]` against the local source file.
- [`rpc-relay.mjs`](rpc-relay.mjs) — universal fetch relay (job queue on port
  8898 + `installFetchRelay()` that patches `globalThis.fetch`, which
  genlayer-js uses for all RPC). Browser worker: [`rpc-relay.html`](rpc-relay.html).
  Self-test: `node rpc-relay.mjs --check`.
- [`deploy-relay.mjs`](deploy-relay.mjs) — deployment through the relay:
  `node --env-file=../../.env deploy-relay.mjs` (open
  <http://localhost:8898/> in a browser while it waits for the relay).
- Register feed / update: `node --env-file=../../.env register.mjs` /
  `node --env-file=../../.env update.mjs` — both tunnel through the relay by
  default (they import `installFetchRelay()` and open the browser tab
  themselves); append `--direct` to bypass the relay on an unrestricted
  network.

After any deployment, re-run `node verify-relay.mjs` — the parity check must
report **MATCH** (deployed calldata identical to
[`contracts/oracle.py`](contracts/oracle.py)) before the deployment counts.

## Deployment status

**The currently deployed contract (`0x2Ab508Bb9Be84ea4ea8388b9b8872017729a2C82`,
deploy tx `0x75446ed8…0d20c`) is the OLDER v1 implementation — not this v2
source.** A byte-for-byte parity check via `verify-relay.mjs` (browser QUIC
relay → `eth_call ConsensusData.getTransactionData` → RLP-decode of the deploy
calldata) confirmed it: the deployed code is 11,895 bytes while the local v2
source is 14,343 bytes; the first divergence is at byte 83 (the v2 source
carries the GenVM `# { "Depends": … }` preamble and the revised docstring).
This confirms the reviewer's complaint that the Explorer deployment was the
older implementation — v2 was never deployed.

Redeployment of the exact v2 source is **ready but blocked on credentials**:
`.env` still contains the placeholder private key. Once a funded Bradbury
testnet key is placed there:

```bash
node --env-file=../../.env deploy-relay.mjs   # with http://localhost:8898/ open in a browser
node verify-relay.mjs                          # parity must report MATCH
node --env-file=../../.env register.mjs
node --env-file=../../.env update.mjs
```

Then update `contract.txt`, `deploy-tx.txt`, and the root README evidence
table with the new address and tx.

## Security notes

- Storage writes happen only after consensus, in deterministic code.
- All `gl.nondet.*` calls live inside the `run_nondet_unsafe` leader/validator
  pair (module-level `_fetch_provenance` is reachable from both).
- The persisted value is re-derived and asserted equal to the verified
  outcome before writing (defense in depth).
- Testnet only; no audit. Values are medians of public APIs, not guaranteed
  market prices.
