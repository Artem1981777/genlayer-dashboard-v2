"use client"
import { useCallback, useEffect, useState } from "react"
import type { CSSProperties } from "react"
import { useWallet } from "@/hooks/use-wallet"
import { sendWriteEx } from "@/lib/genlayer"
import { deployEscrow, readEscrowStatus } from "@/lib/escrow"
import type { EscrowStatus, EscrowEvidence } from "@/lib/escrow"
import { short, addrUrl, txUrl } from "@/lib/format"

const LS_ACTIVE = "gl-escrow-active"
const HEX40 = /^0x[0-9a-fA-F]{40}$/
const inputStyle: CSSProperties = { background: "#0e1420", color: "#eef2f9", border: "1px solid #232b3d", borderRadius: 10, padding: "8px 10px", width: "100%", fontSize: 14 }
function btn(bg: string, off?: boolean): CSSProperties {
  return { background: off ? "#1a2233" : bg, color: off ? "#6b7793" : "#0a0e17", border: "1px solid #232b3d", borderRadius: 10, padding: "8px 14px", fontWeight: 600, cursor: off ? "not-allowed" : "pointer" }
}
function gen(wei?: string): string {
  try { return (Number(BigInt(wei || "0")) / 1e18).toString() } catch { return "0" }
}
function eqAddr(a?: string, b?: string): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase()
}
const STATE_TONE: Record<string, string> = { CREATED: "#f2cf5b", FUNDED: "#5ad1ff", RESOLVED: "#b6ff6c", PAID: "#4fe08b" }

const RETRYABLE = /revert|consensus|undeterm|appeal|leader|timeout|deadline|network|socket|fetch|ECONN|temporar/i
function sleep(ms: number){ return new Promise((r)=>setTimeout(r,ms)) }
function reached(fn: string, s: EscrowStatus | null){
  if(!s) return false
  if(fn==="fund") return s.state==="FUNDED"||s.state==="RESOLVED"||s.state==="PAID"
  if(fn==="resolve") return s.state==="RESOLVED"||s.state==="PAID"
  if(fn==="payout") return s.payout_done===true||s.state==="PAID"
  return false
}

export default function EscrowPage() {
  const { wallets, address, connect, disconnect, connecting, wrongNetwork, ensureNetwork, writeClient } = useWallet()
  const [active, setActive] = useState("")
  const [status, setStatus] = useState<EscrowStatus | null>(null)
  const [evidence, setEvidence] = useState<EscrowEvidence[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState("")
  const [pending, setPending] = useState("")
  const [note, setNote] = useState<{ ok: boolean; text: string; hash?: string } | null>(null)
  const [cSeller, setCSeller] = useState("")
  const [cAmount, setCAmount] = useState("0.001")
  const [cTerms, setCTerms] = useState("Deliver the agreed digital asset to the buyer. RELEASE to seller if delivered as described; REFUND to buyer if not.")
  const [loadAddr, setLoadAddr] = useState("")
  const [evText, setEvText] = useState("")

  useEffect(() => { try { const a = localStorage.getItem(LS_ACTIVE); if (a) setActive(a) } catch {} }, [])

  const refresh = useCallback(async (addr: string) => {
    if (!addr) return
    setLoading(true)
    try { const r = await readEscrowStatus(addr); setStatus(r.status); setEvidence(r.evidence) }
    catch { setStatus(null); setEvidence([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (!active) return
    try { localStorage.setItem(LS_ACTIVE, active) } catch {}
    refresh(active)
  }, [active, refresh])

  useEffect(() => {
    if (!active) return
    const t = setInterval(() => { if (!busy) refresh(active) }, 8000)
    return () => clearInterval(t)
  }, [active, busy, refresh])

  const st = status ? status.state : ""
  const isBuyer = eqAddr(address || "", status ? status.buyer : "")
  const isSeller = eqAddr(address || "", status ? status.seller : "")
  const disabled = !!busy || !writeClient || wrongNetwork
  const amountWei = status ? status.amount_wei : "0"

  const doAction = useCallback(async (label: string, fn: string, args: any[], value: bigint) => {
    if (!writeClient) { setNote({ ok: false, text: "Connect your wallet first." }); return }
    if (!active) { setNote({ ok: false, text: "No escrow selected." }); return }
    setBusy(label); setPending(""); setNote(null)
    const maxTries = fn === "resolve" ? 3 : 1
    try {
      let lastErr: unknown = null
      for (let i = 1; i <= maxTries; i++) {
        try {
          if (i > 1) setNote({ ok: true, text: label + ": AI consensus is flaky on testnet — retrying (attempt " + i + "/" + maxTries + ")…" })
          const r = await sendWriteEx(writeClient, active, fn, args, value, (h) => setPending(h))
          setNote(r.confirmed ? { ok: true, text: label + " confirmed (" + r.result + ")", hash: r.hash } : { ok: true, text: label + " submitted, finalizing on-chain (" + r.result + "). Verify on Explorer.", hash: r.hash })
          lastErr = null
          break
        } catch (e) {
          lastErr = e
          try { const chk = await readEscrowStatus(active); if (reached(fn, chk.status)) { setNote({ ok: true, text: label + " confirmed on-chain." }); lastErr = null; break } } catch {}
          const msg = String((e as { message?: string })?.message ?? e)
          if (i < maxTries && RETRYABLE.test(msg)) { await sleep(2500); continue }
          throw e
        }
      }
      if (lastErr) throw lastErr
    } catch (e) {
      const msg = String((e as { message?: string })?.message ?? e)
      const friendly = /revert|consensus|undeterm|appeal/i.test(msg) ? ("AI consensus reverted — this is a transient GenLayer testnet hiccup, not a bug. Just click " + label + " again to retry (funds stay safe in the contract).") : msg
      setNote({ ok: false, text: friendly, hash: pending || undefined })
    } finally {
      setBusy(""); setPending("")
      try { await refresh(active) } catch {}
    }
  }, [writeClient, active, refresh, pending])

  const doCreate = useCallback(async () => {
    if (!writeClient) { setNote({ ok: false, text: "Connect your wallet first." }); return }
    if (!HEX40.test(cSeller)) { setNote({ ok: false, text: "Enter a valid seller address (0x + 40 hex)." }); return }
    let amt: bigint
    try { amt = BigInt(Math.round(Number(cAmount) * 1e18)) } catch { setNote({ ok: false, text: "Invalid amount." }); return }
    if (amt <= BigInt(0)) { setNote({ ok: false, text: "Amount must be greater than 0." }); return }
    setBusy("create"); setPending(""); setNote(null)
    try {
      const r = await deployEscrow(writeClient, cSeller, amt, cTerms)
      setNote({ ok: true, text: "Escrow deployed at " + r.address, hash: r.hash })
      setActive(r.address)
    } catch (e: any) {
      setNote({ ok: false, text: e && e.message ? e.message : String(e) })
    } finally { setBusy(""); setPending("") }
  }, [writeClient, cSeller, cAmount, cTerms])

  return (
    <>
      <div className="topbar">
        <div>
          <h1 className="h1">AI Escrow Arbiter</h1>
          <div className="sub">Deploy, fund, dispute and settle an AI-adjudicated escrow on GenLayer Testnet Bradbury</div>
        </div>
        <div className="flex gap wrap" style={{ alignItems: "center" }}>
          {address ? (
            <>
              <span className="tag mono">{short(address)}</span>
              {wrongNetwork ? <button style={btn("#f2cf5b")} onClick={() => ensureNetwork()}>Switch to Bradbury</button> : null}
              <button style={btn("#232b3d")} onClick={() => disconnect()}>Disconnect</button>
            </>
          ) : (
            wallets.length ? wallets.map((w) => (
              <button key={w.info.uuid} style={btn("#b6ff6c", connecting)} disabled={connecting} onClick={() => connect(w)}>
                {connecting ? "Connecting…" : "Connect " + w.info.name}
              </button>
            )) : <span className="dim">No wallet detected. Install MetaMask.</span>
          )}
        </div>
      </div>

      {note ? (
        <div className="card mt" style={{ borderColor: note.ok ? "#2f6b45" : "#6b2f2f" }}>
          <div style={{ color: note.ok ? "#4fe08b" : "#ff7b7b" }}>{note.text}</div>
          {note.hash ? <a className="mono" style={{ color: "#5ad1ff" }} href={txUrl(note.hash)} target="_blank" rel="noreferrer">View tx on Explorer ↗</a> : null}
        </div>
      ) : null}

      {busy ? (
        <div className="card mt">
          <b>{busy === "create" ? "Deploying escrow contract…" : busy + " in progress…"}</b>
          <div className="dim mt">{busy === "resolve" ? "AI arbiter is reaching validator consensus — this can take ~20–40s. Do not resend." : "Waiting for GenLayer consensus. Do not resend."}</div>
          {pending ? <a className="mono" style={{ color: "#5ad1ff" }} href={txUrl(pending)} target="_blank" rel="noreferrer">Track tx ↗</a> : null}
        </div>
      ) : null}

      <div className="grid mt" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
        <div className="card">
          <b>Create escrow</b>
          <div className="dim mt">You become the buyer. This deploys a fresh EscrowArbiter contract.</div>
          <div className="grid mt" style={{ gap: 8 }}>
            <input style={inputStyle} placeholder="Seller address (0x…)" value={cSeller} onChange={(e) => setCSeller(e.target.value)} />
            <input style={inputStyle} placeholder="Amount in GEN" value={cAmount} onChange={(e) => setCAmount(e.target.value)} />
            <textarea style={{ ...inputStyle, minHeight: 72 }} placeholder="Release terms" value={cTerms} onChange={(e) => setCTerms(e.target.value)} />
            <button style={btn("#b6ff6c", disabled)} disabled={disabled} onClick={doCreate}>Create escrow (deploy)</button>
          </div>
        </div>

        <div className="card">
          <b>Load existing escrow</b>
          <div className="dim mt">Paste any EscrowArbiter contract address to inspect and act on it.</div>
          <div className="grid mt" style={{ gap: 8 }}>
            <input style={inputStyle} placeholder="Contract address (0x…)" value={loadAddr} onChange={(e) => setLoadAddr(e.target.value)} />
            <button style={btn("#5ad1ff", !HEX40.test(loadAddr.trim()))} disabled={!HEX40.test(loadAddr.trim())} onClick={() => setActive(loadAddr.trim())}>Load</button>
          </div>
        </div>
      </div>

      {active ? (
        <div className="card mt">
          <div className="flex gap wrap" style={{ alignItems: "center", justifyContent: "space-between" }}>
            <div><b>Escrow</b> <a className="mono" style={{ color: "#5ad1ff" }} href={addrUrl(active)} target="_blank" rel="noreferrer">{short(active)} ↗</a></div>
            <div className="flex gap wrap" style={{ alignItems: "center" }}>
              <span className="tag" style={{ color: STATE_TONE[st] || "#eef2f9" }}>{st || "unknown"}</span>
              <button style={btn("#232b3d")} onClick={() => refresh(active)}>{loading ? "…" : "Refresh"}</button>
            </div>
          </div>

          {status ? (
            <div className="grid mt" style={{ gap: 8 }}>
              <div className="rowitem"><span className="dim">Buyer</span><span className="mono">{short(status.buyer)}{isBuyer ? " (you)" : ""}</span></div>
              <div className="rowitem"><span className="dim">Seller</span><span className="mono">{short(status.seller)}{isSeller ? " (you)" : ""}</span></div>
              <div className="rowitem"><span className="dim">Amount</span><span className="mono">{gen(status.amount_wei)} GEN</span></div>
              <div className="rowitem"><span className="dim">Held balance</span><span className="mono">{gen(status.balance_wei)} GEN</span></div>
              {status.verdict ? <div className="rowitem"><span className="dim">Verdict</span><span className="mono">{status.verdict}</span></div> : null}
              {status.verdict_reason ? <div className="rowitem"><span className="dim">Reason</span><span>{status.verdict_reason}</span></div> : null}
              <div className="rowitem"><span className="dim">Payout done</span><span>{status.payout_done ? "yes" : "no"}</span></div>
            </div>
          ) : <div className="dim mt">{loading ? "Loading…" : "Could not read this escrow. Check the address."}</div>}

          <div className="flex gap wrap mt" style={{ alignItems: "center" }}>
            <button style={btn("#4fe08b", disabled || st !== "CREATED" || !isBuyer)} disabled={disabled || st !== "CREATED" || !isBuyer} onClick={() => doAction("fund", "fund", [], BigInt(amountWei || "0"))}>Fund ({gen(amountWei)} GEN)</button>
            <button style={btn("#b6ff6c", disabled || st !== "FUNDED")} disabled={disabled || st !== "FUNDED"} onClick={() => doAction("resolve", "resolve", [], BigInt(0))}>Resolve (AI)</button>
            <button style={btn("#5ad1ff", disabled || st !== "RESOLVED" || !!(status && status.payout_done))} disabled={disabled || st !== "RESOLVED" || !!(status && status.payout_done)} onClick={() => doAction("payout", "payout", [], BigInt(0))}>Payout</button>
          </div>

          <div className="mt">
            <b>Submit evidence</b>
            <div className="dim">Only the buyer or seller, while the escrow is FUNDED.</div>
            <div className="flex gap wrap mt" style={{ alignItems: "center" }}>
              <input style={{ ...inputStyle, flex: 1, minWidth: 220 }} placeholder="Evidence (text or URL)" value={evText} onChange={(e) => setEvText(e.target.value)} />
              <button style={btn("#f2cf5b", disabled || st !== "FUNDED" || !(isBuyer || isSeller) || !evText.trim())} disabled={disabled || st !== "FUNDED" || !(isBuyer || isSeller) || !evText.trim()} onClick={async () => { const t = evText.trim(); await doAction("submit_evidence", "submit_evidence", [t], BigInt(0)); setEvText("") }}>Submit</button>
            </div>
          </div>

          <div className="mt">
            <b>Evidence ({evidence.length})</b>
            <div className="grid mt" style={{ gap: 8 }}>
              {evidence.length ? evidence.map((it, i) => (
                <div key={i} className="rowitem"><span className="tag">{it.role}</span><div style={{ flex: 1, minWidth: 0 }}><div className="mono dim" style={{ fontSize: 12 }}>{short(it.submitter)}</div><div>{it.content}</div></div></div>
              )) : <div className="empty">No evidence submitted yet.</div>}
            </div>
          </div>
        </div>
      ) : null}

      <div className="dim mt" style={{ fontSize: 12 }}>Lifecycle: CREATED → fund → FUNDED → submit evidence → resolve (AI verdict) → RESOLVED → payout → PAID. Funds are held in the contract and released to seller (RELEASE) or buyer (REFUND) by a validator-consensed AI verdict.</div>
    </>
  )
}
