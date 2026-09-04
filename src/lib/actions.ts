// Pure action definitions + REAL per-caller precondition gating (no React deps), unit-tested.
export type Field = { key: string; label: string; type: "text" | "number" | "select"; options?: string[]; placeholder?: string }
export type ActionDef = {
  fn: string; label: string; tone?: "ok" | "bad" | "warn"; fields?: Field[]
  build?: (v: Record<string, string>) => any[]; value?: (v: Record<string, string>) => bigint
  role?: "creator" | "author"; phase?: (st: any) => boolean
  enabled?: (st: any, acct?: string | null) => boolean
  why?: (st: any, acct?: string | null) => string | null
  validate?: (v: Record<string, string>) => string | null
}
export const isCreator = (st: any, acct?: string | null) => !!(acct && st && st.creator && String(acct).toLowerCase() === String(st.creator).toLowerCase())
export const isAuthor = (st: any, acct?: string | null) => !!(acct && st && st.author && String(acct).toLowerCase() === String(st.author).toLowerCase())
// strict positive-integer wei parser for stake: rejects empty, zero, negative, fractional, non-numeric.
export const parseStakeWei = (raw: any): bigint | null => {
  const s = String(raw ?? "").trim()
  if (!/^\d+$/.test(s)) return null
  const n = BigInt(s)
  return n > 0n ? n : null
}
// ---- per-caller helpers: read the same JSON the contract stores in get_state ----
const parseObj = (raw: any): Record<string, any> => { try { const v = typeof raw === "string" ? JSON.parse(raw) : raw; return v && typeof v === "object" && !Array.isArray(v) ? v : {} } catch { return {} } }
const num = (x: any) => { const n = Number(x); return Number.isFinite(n) ? n : 0 }
const findKey = (obj: Record<string, any>, acct?: string | null) => acct ? Object.keys(obj).find((k) => k.toLowerCase() === String(acct).toLowerCase()) : undefined
export const myPosition = (st: any, acct?: string | null): { YES: number; NO: number } => {
  if (!acct || !st) return { YES: 0, NO: 0 }
  const pos = parseObj(st.positions); const k = findKey(pos, acct); const p = k ? pos[k] : null
  return { YES: num(p && p.YES), NO: num(p && p.NO) }
}
export const hasStake = (st: any, acct?: string | null) => { const p = myPosition(st, acct); return p.YES + p.NO > 0 }
export const winningStake = (st: any, acct?: string | null) => { const p = myPosition(st, acct); return st && st.winning_side === "YES" ? p.YES : st && st.winning_side === "NO" ? p.NO : 0 }
export const claimRecord = (st: any, acct?: string | null) => { if (!acct || !st) return null; const c = parseObj(st.claims); const k = findKey(c, acct); return k ? c[k] : null }
export const alreadyClaimed = (st: any, acct?: string | null) => { const c = claimRecord(st, acct); return !!(c && c.claimed) }
// refund() writes into the same "claims" map claim() uses (both set claimed:true), so double-refund is gated by the same record.
export const alreadyRefunded = (st: any, acct?: string | null) => alreadyClaimed(st, acct)
export const disputeRounds = (st: any): number => { if (!st) return 0; try { const h = typeof st.history === "string" ? JSON.parse(st.history) : st.history; return Array.isArray(h) ? h.filter((it: any) => it && it.kind === "dispute").length : 0 } catch { return 0 } }
export const canVoid = (st: any) => !!(st && (st.status === "open" || st.status === "dispute_window" || st.status === "dispute_resolved") && (st.outcome === "" || st.outcome === "UNRESOLVED" || st.outcome === undefined))
// dispute-window helpers: deadline is epoch seconds stored on-chain by resolve()/resolve_dispute()
export const disputeDeadline = (st: any): number => { const n = Number(st && st.dispute_deadline); return Number.isFinite(n) ? n : 0 }
export const disputeWindowSeconds = (st: any): number => { const n = Number(st && st.dispute_window_seconds); return Number.isFinite(n) && n > 0 ? n : 0 }
export const disputeWindowOpen = (st: any, nowSec?: number): boolean => {
  if (!st) return false
  if (st.status !== "dispute_window" && st.status !== "dispute_resolved") return false
  const dl = disputeDeadline(st)
  if (dl <= 0) return false
  const now = nowSec ?? Math.floor(Date.now() / 1000)
  return now < dl
}
export const disputeWindowRemaining = (st: any, nowSec?: number): number => {
  if (!disputeWindowOpen(st, nowSec)) return 0
  return Math.max(0, disputeDeadline(st) - (nowSec ?? Math.floor(Date.now() / 1000)))
}
export const frozenSources = (st: any): string[] => { if (!st) return []; try { const v = typeof st.frozen_sources === "string" ? JSON.parse(st.frozen_sources) : st.frozen_sources; return Array.isArray(v) ? v.filter((u: any) => typeof u === "string") : [] } catch { return [] } }
export const sourcesFrozen = (st: any) => !!(st && st.sources_frozen === true)
export const voidReasonLabel = (st: any): string => {
  if (!st || st.status !== "voided") return ""
  if (st.void_reason === "winning_side_empty") return "Voided automatically: nobody backed the winning side, refunds are open"
  if (st.void_reason === "creator_void") return "Voided by the creator, refunds are open"
  return "Voided, refunds are open"
}
// ---- gating primitives ----
export const roleOk = (a: ActionDef, st: any, acct?: string | null) => a.role === "creator" ? isCreator(st, acct) : a.role === "author" ? isAuthor(st, acct) : true
export const phaseOk = (a: ActionDef, st: any) => a.phase ? !!a.phase(st) : true
export const enabledOk = (a: ActionDef, st: any, acct?: string | null) => a.enabled ? !!a.enabled(st, acct) : true
export const canDo = (a: ActionDef, st: any, acct?: string | null) => phaseOk(a, st) && roleOk(a, st, acct) && enabledOk(a, st, acct)
export const whyNot = (a: ActionDef, st: any, acct?: string | null): string =>
  !phaseOk(a, st) ? "Not available in the current phase"
  : !roleOk(a, st, acct) ? (a.role === "creator" ? "Only the market creator can do this" : a.role === "author" ? "Only the content author can do this" : "Not available for your wallet")
  : !enabledOk(a, st, acct) ? ((a.why && a.why(st, acct)) || "Not available for your wallet")
  : ""
export const ACTIONS: Record<string, ActionDef[]> = {
  prediction: [
    { fn: "stake", label: "Stake", tone: "ok", fields: [ { key: "side", label: "Side", type: "select", options: ["YES", "NO"] }, { key: "amount", label: "Amount (wei)", type: "number", placeholder: "100" } ], build: (v) => [v.side || "YES"], value: (v) => { const w = parseStakeWei(v.amount); if (w === null) throw new Error("Enter a whole, strictly positive wei amount before staking"); return w }, validate: (v) => (v.side !== "YES" && v.side !== "NO") ? "Choose a side (YES or NO)" : parseStakeWei(v.amount) === null ? "Enter a whole, strictly positive wei amount (no zero, negative or fractional values)" : null, phase: (st) => st && st.status === "open" },
    { fn: "add_source", label: "Add source", fields: [ { key: "url", label: "Source URL", type: "text", placeholder: "https://example.com/market-source" } ], build: (v) => [v.url || ""], validate: (v) => (v.url && /^https?:\/\//.test(v.url.trim())) ? null : "Enter an http(s) source URL", role: "creator", phase: (st) => st && st.status === "open", enabled: (st) => !sourcesFrozen(st), why: () => "Sources are frozen: staking has started, the source set is locked" },
    { fn: "resolve", label: "Resolve", role: "creator", phase: (st) => st && st.status === "open" },
    { fn: "void", label: "Void", tone: "warn", role: "creator", phase: (st) => st && (st.status === "open" || st.status === "dispute_window" || st.status === "dispute_resolved"), enabled: (st) => canVoid(st), why: () => "Cannot void a market with a definite YES/NO outcome; settle it instead" },
    { fn: "dispute", label: "Dispute", tone: "warn", fields: [ { key: "reason", label: "Reason", type: "text", placeholder: "Requesting re-review of the cited sources" } ], build: (v) => [v.reason || ""], phase: (st) => st && (st.status === "dispute_window" || st.status === "dispute_resolved"), validate: (v) => (v && v.reason && v.reason.trim().length > 0) ? null : "Enter a reason to dispute", enabled: (st, acct) => disputeWindowOpen(st) && hasStake(st, acct) && disputeRounds(st) < 2, why: (st, acct) => !disputeWindowOpen(st) ? "Dispute window has closed; the resolved outcome is final" : !hasStake(st, acct) ? "Only a participant who staked this market can dispute" : disputeRounds(st) >= 2 ? "Dispute limit reached (max 2) for this market" : null },
    { fn: "resolve_dispute", label: "Resolve dispute", role: "creator", phase: (st) => st && st.status === "disputed" },
    { fn: "settle", label: "Settle", role: "creator", phase: (st) => st && (st.status === "dispute_window" || st.status === "dispute_resolved") && (st.outcome === "YES" || st.outcome === "NO"), enabled: (st) => !disputeWindowOpen(st), why: (st) => disputeWindowOpen(st) ? "Dispute window is still open; settlement unlocks after the deadline" : null },
    { fn: "claim", label: "Claim", tone: "ok", phase: (st) => st && st.status === "settled", enabled: (st, acct) => winningStake(st, acct) > 0 && !alreadyClaimed(st, acct), why: (st, acct) => winningStake(st, acct) <= 0 ? "No winning stake to claim" : alreadyClaimed(st, acct) ? "Already claimed" : null },
    { fn: "refund", label: "Refund", tone: "ok", phase: (st) => st && st.status === "voided", enabled: (st, acct) => hasStake(st, acct) && !alreadyRefunded(st, acct), why: (st, acct) => !hasStake(st, acct) ? "Nothing to refund" : alreadyRefunded(st, acct) ? "Already refunded" : null },
  ],
  moderator: [
    { fn: "moderate", label: "Moderate", tone: "ok", phase: (st) => st && st.status === "pending" },
    { fn: "enforce", label: "Enforce", tone: "warn", role: "creator", phase: (st) => st && st.status === "moderated" },
    { fn: "appeal", label: "Appeal", tone: "warn", fields: [ { key: "note", label: "Note", type: "text", placeholder: "Why you disagree with the verdict" } ], build: (v) => [v.note || ""], role: "author", phase: (st) => st && st.status === "enforced" && (st.verdict === "FLAG" || st.verdict === "REMOVE") },
    { fn: "resolve_appeal", label: "Resolve appeal", role: "creator", phase: (st) => st && st.status === "appealed" },
  ],
  oracle: [
    { fn: "update", label: "Update feed", tone: "ok", fields: [ { key: "key", label: "Feed key", type: "text", placeholder: "btc_usd" } ], build: (v) => [v.key || "btc_usd"], phase: (st) => { try { const f = st && st.feeds ? JSON.parse(st.feeds) : null; return !!(f && Object.keys(f).length) } catch { return false } } },
  ],
}
export const visibleActions = (projectId: string, st: any, acct?: string | null): ActionDef[] => (ACTIONS[projectId] || []).filter((a) => canDo(a, st, acct))
