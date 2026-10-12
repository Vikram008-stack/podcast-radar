"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Status = "draft" | "sent" | "replied" | "booked" | "declined";
export type TrackRow = { id: string; name: string; sub: string; href: string };

const STEPS: [Status, string][] = [
  ["sent", "📤 Sent"],
  ["replied", "💬 Replied"],
  ["booked", "🎉 Booked"],
  ["declined", "🙅 No"],
];

/** Impact tiles + inline outreach tracker: mark status right here; counts update instantly. */
export function ImpactTracker({
  episodesAnalysed,
  hoursSaved,
  guests,
  sponsors,
  initial,
}: {
  episodesAnalysed: number;
  hoursSaved: number;
  guests: TrackRow[];
  sponsors: TrackRow[];
  initial: Record<string, Status>; // key = `${kind}:${targetId}`
}) {
  const [status, setStatus] = useState<Record<string, Status>>(initial);
  const [msg, setMsg] = useState<string | null>(null);

  const count = useMemo(() => {
    const c = { outreach: { sent: 0, replied: 0, booked: 0 }, pitch: { sent: 0, booked: 0 } };
    for (const [k, s] of Object.entries(status)) {
      const kind = k.startsWith("pitch:") ? "pitch" : "outreach";
      const contacted = s === "sent" || s === "replied" || s === "booked" || s === "declined";
      if (kind === "outreach") {
        if (contacted) c.outreach.sent++;
        if (s === "replied" || s === "booked") c.outreach.replied++;
        if (s === "booked") c.outreach.booked++;
      } else {
        if (contacted) c.pitch.sent++;
        if (s === "booked") c.pitch.booked++;
      }
    }
    return c;
  }, [status]);

  async function mark(kind: "outreach" | "pitch", id: string, next: Status) {
    const key = `${kind}:${id}`;
    const value: Status = status[key] === next ? "draft" : next; // click again to undo
    setStatus((s) => ({ ...s, [key]: value }));
    const url = kind === "outreach" ? `/api/guests/${id}/outreach-draft` : `/api/sponsors/${id}/pitch-draft`;
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "status", status: value }) });
      if (!res.ok) throw new Error();
      setMsg("Saved");
    } catch {
      setMsg("Could not save — try again");
    }
  }

  const tile = (n: string | number, label: string, href: string) => (
    <a href={href} className="impact-tile">
      <strong>{n}</strong>
      <small>{label}</small>
    </a>
  );

  const list = (kind: "outreach" | "pitch", rows: TrackRow[], title: string, anchor: string) => (
    <div id={anchor} className="track-list">
      <p className="eyebrow" style={{ margin: "18px 0 8px" }}>{title}</p>
      {rows.length === 0 ? <small style={{ color: "var(--muted)" }}>Nothing to track in this brief yet.</small> : null}
      {rows.map((r) => {
        const s = status[`${kind}:${r.id}`] ?? "draft";
        return (
          <div key={r.id} className="track-row">
            <Link href={r.href} className="track-name">
              <strong>{r.name}</strong>
              <small>{r.sub}</small>
            </Link>
            <div className="status-track" role="group" aria-label={`Status for ${r.name}`}>
              {STEPS.map(([k, label]) => (
                <button key={k} className={s === k ? "on" : ""} aria-pressed={s === k} onClick={() => mark(kind, r.id, k)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="panel" style={{ marginTop: 16 }}>
      <p className="eyebrow">📈 Impact · last 30 days</p>
      <div className="impact">
        {tile(episodesAnalysed, "episodes analysed for you →", "/settings")}
        {tile(`~${hoursSaved}h`, "manual research saved (≈6 min / episode)", "/settings")}
        {tile(count.outreach.sent, "guest emails / DMs sent ↓", "#track-guests")}
        {tile(count.outreach.replied, "guest replies ↓", "#track-guests")}
        {tile(count.outreach.booked, "🎉 guests booked ↓", "#track-guests")}
        {tile(count.pitch.sent, "sponsor pitches sent ↓", "#track-sponsors")}
        {tile(count.pitch.booked, "sponsors signed ↓", "#track-sponsors")}
      </div>
      {list("outreach", guests, "🎙️ Track guest outreach", "track-guests")}
      {list("pitch", sponsors, "💸 Track sponsor pitches", "track-sponsors")}
      <small style={{ color: "var(--muted)", fontSize: 12 }}>
        Click a status to record it (click again to undo). Open a name to copy the ready-made email or DM. {msg ? `· ${msg}` : ""}
      </small>
    </div>
  );
}
