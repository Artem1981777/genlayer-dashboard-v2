import { describe, it, expect } from "vitest"
import { ACTIONS, canDo, whyNot, visibleActions, isCreator, isAuthor, hasStake, winningStake, alreadyClaimed, alreadyRefunded, disputeRounds, disputeDeadline, disputeWindowSeconds, disputeWindowOpen, disputeWindowRemaining, frozenSources, sourcesFrozen, voidReasonLabel, canVoid } from "./actions"
const NOW = () => Math.floor(Date.now() / 1000)
const futureDeadline = (sec = 3600) => NOW() + sec
const pastDeadline = (sec = 3600) => NOW() - sec
const CREATOR = "0x198a1952BD58984281f57CF824d264cdbd412814"
const AUTHOR = "0xB596E244aabBccDDeeFF00112233445566778899"
const JUDGE = "0xdc6778C5F8cC74b10aED11c48306D4Cfc5737FBD"
const V = (p: string, st: any, acct?: string | null) => visibleActions(p, st, acct).map((a) => a.fn).sort()
const posOf = (m: any) => JSON.stringify(m)
const disputes = (n: number) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ round: i + 1, kind: "dispute" })))
const PM = ACTIONS.prediction
const find = (fn: string) => PM.find((a) => a.fn === fn)!
const cases: Array<[string, string, any, string | null, string[]]> = [
  ["pred non-creator open", "prediction", { status: "open", creator: CREATOR }, JUDGE, ["stake"]],
  ["pred creator open", "prediction", { status: "open", creator: CREATOR }, CREATOR, ["add_source", "resolve", "stake", "void"]],
  ["pred creator open sources frozen", "prediction", { status: "open", creator: CREATOR, sources_frozen: true }, CREATOR, ["resolve", "stake", "void"]],
  ["pred dispute_window non-participant", "prediction", { status: "dispute_window", outcome: "YES", dispute_deadline: futureDeadline(), creator: CREATOR }, JUDGE, []],
  ["pred dispute_window participant", "prediction", { status: "dispute_window", outcome: "YES", dispute_deadline: futureDeadline(), creator: CREATOR, positions: posOf({ [JUDGE]: { YES: 100, NO: 0 } }) }, JUDGE, ["dispute"]],
  ["pred dispute_window dispute-limit", "prediction", { status: "dispute_window", outcome: "YES", dispute_deadline: futureDeadline(), creator: CREATOR, positions: posOf({ [JUDGE]: { YES: 100, NO: 0 } }), history: disputes(2) }, JUDGE, []],
  ["pred dispute_window closed participant", "prediction", { status: "dispute_window", outcome: "YES", dispute_deadline: pastDeadline(), creator: CREATOR, positions: posOf({ [JUDGE]: { YES: 100, NO: 0 } }) }, JUDGE, []],
  ["pred dispute_window closed creator settles", "prediction", { status: "dispute_window", outcome: "YES", dispute_deadline: pastDeadline(), creator: CREATOR }, CREATOR, ["settle"]],
  ["pred dispute_window open creator cannot settle", "prediction", { status: "dispute_window", outcome: "YES", dispute_deadline: futureDeadline(), creator: CREATOR }, CREATOR, []],
  ["pred dispute_resolved fresh window participant", "prediction", { status: "dispute_resolved", outcome: "NO", dispute_deadline: futureDeadline(), creator: CREATOR, positions: posOf({ [JUDGE]: { YES: 0, NO: 40 } }), history: disputes(1) }, JUDGE, ["dispute"]],
  ["pred dispute_resolved closed creator", "prediction", { status: "dispute_resolved", outcome: "NO", dispute_deadline: pastDeadline(), creator: CREATOR }, CREATOR, ["settle"]],
  ["pred disputed creator only", "prediction", { status: "disputed", outcome: "YES", creator: CREATOR }, CREATOR, ["resolve_dispute"]],
  ["pred disputed judge", "prediction", { status: "disputed", outcome: "YES", creator: CREATOR }, JUDGE, []],
  ["pred dispute_window UNRESOLVED outcome cannot settle", "prediction", { status: "dispute_window", outcome: "UNRESOLVED", dispute_deadline: pastDeadline(), creator: CREATOR }, CREATOR, ["void"]],
  ["pred settled winner unclaimed", "prediction", { status: "settled", creator: CREATOR, winning_side: "YES", positions: posOf({ [JUDGE]: { YES: 100, NO: 0 } }) }, JUDGE, ["claim"]],
  ["pred settled winner claimed", "prediction", { status: "settled", creator: CREATOR, winning_side: "YES", positions: posOf({ [JUDGE]: { YES: 100, NO: 0 } }), claims: posOf({ [JUDGE]: { claimed: true } }) }, JUDGE, []],
  ["pred settled loser", "prediction", { status: "settled", creator: CREATOR, winning_side: "YES", positions: posOf({ [JUDGE]: { YES: 0, NO: 100 } }) }, JUDGE, []],
  ["pred settled non-participant", "prediction", { status: "settled", creator: CREATOR, winning_side: "YES" }, JUDGE, []],
  ["pred voided participant", "prediction", { status: "voided", creator: CREATOR, positions: posOf({ [JUDGE]: { YES: 0, NO: 80 } }) }, JUDGE, ["refund"]],
  ["pred voided refunded", "prediction", { status: "voided", creator: CREATOR, positions: posOf({ [JUDGE]: { YES: 0, NO: 80 } }), claims: posOf({ [JUDGE]: { claimed: true } }) }, JUDGE, []],
  ["pred voided non-participant", "prediction", { status: "voided", creator: CREATOR }, JUDGE, []],
  ["mod pending any", "moderator", { status: "pending", creator: CREATOR, author: CREATOR }, JUDGE, ["moderate"]],
  ["mod moderated creator", "moderator", { status: "moderated", creator: CREATOR, author: AUTHOR }, CREATOR, ["enforce"]],
  ["mod moderated judge", "moderator", { status: "moderated", creator: CREATOR, author: AUTHOR }, JUDGE, []],
  ["mod enforced author REMOVE", "moderator", { status: "enforced", verdict: "REMOVE", creator: CREATOR, author: AUTHOR }, AUTHOR, ["appeal"]],
  ["mod enforced author ALLOW", "moderator", { status: "enforced", verdict: "ALLOW", creator: CREATOR, author: AUTHOR }, AUTHOR, []],
  ["mod enforced judge", "moderator", { status: "enforced", verdict: "REMOVE", creator: CREATOR, author: AUTHOR }, JUDGE, []],
  ["mod appealed creator", "moderator", { status: "appealed", creator: CREATOR, author: AUTHOR }, CREATOR, ["resolve_appeal"]],
  ["mod resolved terminal", "moderator", { status: "resolved", verdict: "REMOVE", creator: CREATOR, author: AUTHOR }, JUDGE, []],
  ["oracle feeds", "oracle", { feeds: JSON.stringify({ btc_usd: {} }) }, JUDGE, ["update"]],
  ["oracle empty feeds", "oracle", { feeds: "{}" }, JUDGE, []],
  ["oracle no feeds", "oracle", {}, JUDGE, []],
  ["oracle bad json", "oracle", { feeds: "not json" }, JUDGE, []],
]
describe("role/phase/precondition action visibility", () => {
  for (const [name, proj, st, acct, expected] of cases) {
    it(name, () => { expect(V(proj, st, acct)).toEqual([...expected].sort()) })
  }
})
describe("precise whyNot reasons for per-caller gating", () => {
  it("claim no winning stake", () => { expect(whyNot(find("claim"), { status: "settled", winning_side: "YES" }, JUDGE)).toBe("No winning stake to claim") })
  it("claim already claimed", () => { expect(whyNot(find("claim"), { status: "settled", winning_side: "YES", positions: posOf({ [JUDGE]: { YES: 10, NO: 0 } }), claims: posOf({ [JUDGE]: { claimed: true } }) }, JUDGE)).toBe("Already claimed") })
  it("dispute non-participant", () => { expect(whyNot(find("dispute"), { status: "dispute_window", dispute_deadline: futureDeadline() }, JUDGE)).toBe("Only a participant who staked this market can dispute") })
  it("dispute limit", () => { expect(whyNot(find("dispute"), { status: "dispute_window", dispute_deadline: futureDeadline(), positions: posOf({ [JUDGE]: { YES: 5, NO: 0 } }), history: disputes(2) }, JUDGE)).toBe("Dispute limit reached (max 2) for this market") })
  it("dispute window closed", () => { expect(whyNot(find("dispute"), { status: "dispute_window", dispute_deadline: pastDeadline(), positions: posOf({ [JUDGE]: { YES: 5, NO: 0 } }) }, JUDGE)).toBe("Dispute window has closed; the resolved outcome is final") })
  it("settle while window open", () => { expect(whyNot(find("settle"), { status: "dispute_window", outcome: "YES", dispute_deadline: futureDeadline(), creator: CREATOR }, CREATOR)).toBe("Dispute window is still open; settlement unlocks after the deadline") })
  it("refund nothing", () => { expect(whyNot(find("refund"), { status: "voided" }, JUDGE)).toBe("Nothing to refund") })
  it("void definite outcome", () => { expect(whyNot(find("void"), { status: "open", creator: CREATOR, outcome: "YES" }, CREATOR)).toBe("Cannot void a market with a definite YES/NO outcome; settle it instead") })
  it("add_source frozen", () => { expect(whyNot(find("add_source"), { status: "open", creator: CREATOR, sources_frozen: true }, CREATOR)).toBe("Sources are frozen: staking has started, the source set is locked") })
  it("wrong-phase message", () => { expect(whyNot(find("claim"), { status: "open", creator: CREATOR }, JUDGE)).toBe("Not available in the current phase") })
  it("creator-only message", () => { expect(whyNot(find("resolve"), { status: "open", creator: CREATOR }, JUDGE)).toBe("Only the market creator can do this") })
})
describe("dispute-window helpers", () => {
  it("deadline + window seconds parsing", () => {
    expect(disputeDeadline({ dispute_deadline: 1750000000 })).toBe(1750000000)
    expect(disputeDeadline({})).toBe(0)
    expect(disputeWindowSeconds({ dispute_window_seconds: 600 })).toBe(600)
    expect(disputeWindowSeconds({ dispute_window_seconds: -5 })).toBe(0)
  })
  it("window open/closed by status and deadline", () => {
    const now = NOW()
    expect(disputeWindowOpen({ status: "dispute_window", dispute_deadline: now + 100 }, now)).toBe(true)
    expect(disputeWindowOpen({ status: "dispute_resolved", dispute_deadline: now + 100 }, now)).toBe(true)
    expect(disputeWindowOpen({ status: "dispute_window", dispute_deadline: now - 100 }, now)).toBe(false)
    expect(disputeWindowOpen({ status: "dispute_window", dispute_deadline: now }, now)).toBe(false)
    expect(disputeWindowOpen({ status: "open", dispute_deadline: now + 100 }, now)).toBe(false)
    expect(disputeWindowOpen({ status: "dispute_window" }, now)).toBe(false)
  })
  it("remaining seconds bounded", () => {
    const now = NOW()
    expect(disputeWindowRemaining({ status: "dispute_window", dispute_deadline: now + 90 }, now)).toBe(90)
    expect(disputeWindowRemaining({ status: "dispute_window", dispute_deadline: now - 90 }, now)).toBe(0)
  })
})
describe("freeze + void helpers", () => {
  it("frozenSources parses JSON array of strings", () => {
    expect(frozenSources({ frozen_sources: JSON.stringify(["https://a.example", "https://b.example"]) })).toEqual(["https://a.example", "https://b.example"])
    expect(frozenSources({ frozen_sources: "not json" })).toEqual([])
    expect(frozenSources({})).toEqual([])
  })
  it("sourcesFrozen strict boolean", () => {
    expect(sourcesFrozen({ sources_frozen: true })).toBe(true)
    expect(sourcesFrozen({ sources_frozen: "true" })).toBe(false)
    expect(sourcesFrozen({})).toBe(false)
  })
  it("voidReasonLabel maps on-chain reasons", () => {
    expect(voidReasonLabel({ status: "voided", void_reason: "winning_side_empty" })).toMatch(/nobody backed the winning side/i)
    expect(voidReasonLabel({ status: "voided", void_reason: "creator_void" })).toMatch(/voided by the creator/i)
    expect(voidReasonLabel({ status: "voided" })).toMatch(/voided, refunds are open/i)
    expect(voidReasonLabel({ status: "settled" })).toBe("")
  })
  it("canVoid only without definite outcome", () => {
    expect(canVoid({ status: "open", outcome: "" })).toBe(true)
    expect(canVoid({ status: "open", outcome: "UNRESOLVED" })).toBe(true)
    expect(canVoid({ status: "dispute_window", outcome: "UNRESOLVED" })).toBe(true)
    expect(canVoid({ status: "open", outcome: "YES" })).toBe(false)
    expect(canVoid({ status: "settled", outcome: "YES" })).toBe(false)
  })
})
describe("identity + helpers", () => {
  it("identity case-insensitive", () => { expect(isCreator({ creator: CREATOR }, CREATOR.toLowerCase())).toBe(true); expect(isAuthor({ author: AUTHOR }, AUTHOR.toUpperCase())).toBe(true) })
  it("stake/winning/claimed/disputeRounds helpers", () => {
    const st = { winning_side: "NO", positions: posOf({ [JUDGE]: { YES: 0, NO: 30 } }), claims: posOf({ [JUDGE]: { claimed: true } }), history: disputes(1) }
    expect(hasStake(st, JUDGE)).toBe(true); expect(winningStake(st, JUDGE)).toBe(30); expect(alreadyClaimed(st, JUDGE)).toBe(true); expect(disputeRounds(st)).toBe(1)
  })
})

describe("field validation + refund record", () => {
  const disp = find("dispute")
  it("dispute requires non-empty reason", () => { expect(disp.validate!({ reason: "" })).toBe("Enter a reason to dispute"); expect(disp.validate!({ reason: "   " })).toBe("Enter a reason to dispute"); expect(disp.validate!({ reason: "re-check sources" })).toBeNull() })
  it("refund double-spend gated by shared claims map", () => { const st = { status: "voided", creator: CREATOR, positions: posOf({ [JUDGE]: { YES: 0, NO: 80 } }), claims: posOf({ [JUDGE]: { claimed: true } }) }; expect(alreadyRefunded(st, JUDGE)).toBe(true); expect(whyNot(find("refund"), st, JUDGE)).toBe("Already refunded") })
})

import { parseStakeWei } from "./actions"
describe("stake amount validation (strict, pre-wallet)", () => {
  const stake = ACTIONS.prediction.find((a) => a.fn === "stake")!
  it("parseStakeWei rejects empty/zero/negative/fractional/non-numeric", () => {
    expect(parseStakeWei("")).toBeNull()
    expect(parseStakeWei("0")).toBeNull()
    expect(parseStakeWei("-5")).toBeNull()
    expect(parseStakeWei("1.5")).toBeNull()
    expect(parseStakeWei("abc")).toBeNull()
    expect(parseStakeWei(" 10 ")).toBe(10n)
    expect(parseStakeWei("100")).toBe(100n)
  })
  it("stake.validate blocks bad side/amount and passes valid input", () => {
    expect(stake.validate!({ side: "YES", amount: "0" })).toMatch(/positive/i)
    expect(stake.validate!({ side: "YES", amount: "" })).toMatch(/positive/i)
    expect(stake.validate!({ side: "YES", amount: "-1" })).toMatch(/positive/i)
    expect(stake.validate!({ side: "YES", amount: "1.2" })).toMatch(/positive/i)
    expect(stake.validate!({ side: "MAYBE", amount: "10" })).toMatch(/side/i)
    expect(stake.validate!({ side: "YES", amount: "100" })).toBeNull()
    expect(stake.validate!({ side: "NO", amount: "1" })).toBeNull()
  })
  it("stake.value returns exact positive wei and throws on invalid", () => {
    expect(stake.value!({ amount: "250", side: "YES" })).toBe(250n)
    expect(() => stake.value!({ amount: "0", side: "YES" })).toThrow()
  })
})
