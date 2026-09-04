"use client"
import { useEffect, useState } from "react"
import { disputeDeadline, disputeWindowOpen, disputeWindowRemaining, disputeWindowSeconds } from "@/lib/actions"
import { Hourglass, LockOpen } from "lucide-react"

const pad = (n: number) => String(n).padStart(2, "0")
const fmt = (sec: number) => {
  const s = Math.max(0, sec)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = Math.floor(s % 60)
  return (d > 0 ? d + "d " : "") + pad(h) + ":" + pad(m) + ":" + pad(ss)
}

// Live countdown to the on-chain dispute deadline (epoch seconds stored by resolve()/resolve_dispute()).
// Renders nothing outside the dispute_window / dispute_resolved statuses; flips to a
// "window closed" tag the second the deadline passes, so settlement unlocking is visible.
export function DisputeCountdown({ state }: { state: any }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const st = state || {}
  const relevant = st.status === "dispute_window" || st.status === "dispute_resolved"
  const dl = disputeDeadline(st)
  if (!relevant || dl <= 0) return null
  if (!disputeWindowOpen(st)) {
    return (
      <div className="tag" style={{ display: "inline-flex" }}>
        <LockOpen size={12} /> dispute window closed · outcome final · settlement unlocked
      </div>
    )
  }
  const remaining = disputeWindowRemaining(st)
  const total = disputeWindowSeconds(st)
  const frac = total > 0 ? Math.max(0, Math.min(1, 1 - remaining / total)) : 1
  const urgent = remaining <= 300
  return (
    <div className="mt8" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="flex center gap wrap" style={{ fontSize: 12.5 }}>
        <Hourglass size={13} />
        <span className="dim">dispute window closes in</span>
        <span className="mono" style={{ color: urgent ? "var(--warn)" : "var(--fg)", fontWeight: 700, fontSize: 14 }}>{fmt(remaining)}</span>
        {total > 0 ? <span className="dim">· {Math.round(frac * 100)}% elapsed</span> : null}
        <span className="dim">· settle unlocks at {new Date(dl * 1000).toLocaleTimeString()}</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: "var(--panel2)", border: "1px solid var(--line)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: (frac * 100).toFixed(1) + "%", background: urgent ? "var(--warn)" : "var(--accent)", transition: "width 1s linear" }} />
      </div>
    </div>
  )
}
