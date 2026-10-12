"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Kind = "outreach" | "topic" | "pitch";
export type TrackRow = { id: string; name: string; sub: string; href: string };
type StatusMap = Record<string, string>; // key = `${kind}:${targetId}`

const SECTIONS: {
  kind: Kind;
  anchor: string;
  title: string;
  why: string;
  steps: [string, string][];
  funnel: [string, string[]][]; // label → statuses that count
  endpoint: (id: string) => string;
}[] = [
  {
    kind: "outreach",
    anchor: "booking",
    title: "Booking outreach",
    why: "Founders from this week's brief. Invite them while they are doing media rounds.",
    steps: [["sent", "Sent"], ["replied", "Replied"], ["booked", "Booked"], ["declined", "Declined"]],
    funnel: [["Invites sent", ["sent", "replied", "booked", "declined"]], ["Replies", ["replied", "booked"]], ["Guests booked", ["booked"]]],
    endpoint: (id) => `/api/guests/${id}/outreach-draft`,
  },
  {
    kind: "topic",
    anchor: "calendar",
    title: "Content calendar",
    why: "Topics other shows covered this week. Plan an episode to ride the wave or counter-programme it.",
    steps: [["planned", "Planned"], ["recorded", "Recorded"], ["published", "Published"]],
    funnel: [["Episodes planned", ["planned", "recorded", "published"]], ["Recorded", ["recorded", "published"]], ["Published", ["published"]]],
    endpoint: (id) => `/api/topics/${id}/plan`,
  },
  {
    kind: "pitch",
    anchor: "sponsors",
    title: "Sponsor list",
    why: "Brands already paying to reach founder audiences. Pitch them a slot on your show.",
    steps: [["sent", "Pitched"], ["replied", "Replied"], ["booked", "Signed"], ["declined", "Declined"]],
    funnel: [["Pitches sent", ["sent", "replied", "booked", "declined"]], ["Replies", ["replied", "booked"]], ["Sponsors signed", ["booked"]]],
    endpoint: (id) => `/api/sponsors/${id}/pitch-draft`,
  },
];

/** Impact page: the three outcomes the brief drives, each with a funnel and an inline tracker. */
export function ImpactTracker({
  episodesAnalysed,
  hoursSaved,
  rows,
  initial,
}: {
  episodesAnalysed: number;
  hoursSaved: number;
  rows: Record<Kind, TrackRow[]>;
  initial: StatusMap;
}) {
  const [status, setStatus] = useState<StatusMap>(initial);
  const [msg, setMsg] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const sec of SECTIONS) {
      for (const [label, states] of sec.funnel) {
        c[`${sec.kind}:${label}`] = Object.entries(status).filter(([k, v]) => k.startsWith(`${sec.kind}:`) && states.includes(v)).length;
      }
    }
    return c;
  }, [status]);

  async function mark(sec: (typeof SECTIONS)[number], id: string, next: string) {
    const key = `${sec.kind}:${id}`;
    const value = status[key] === next ? "draft" : next; // click again to undo
    setStatus((s) => ({ ...s, [key]: value }));
    try {
      const body = sec.kind === "topic" ? { status: value } : { action: "status", status: value };
      const res = await fetch(sec.endpoint(id), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      setMsg("Saved");
    } catch {
      setMsg("Could not save. Try again.");
    }
  }

  return (
    <>
      <div className="impact" style={{ marginBottom: 8 }}>
        <a href="/settings" className="impact-tile">
          <strong>{episodesAnalysed}</strong>
          <small>episodes analysed for you</small>
        </a>
        <a href="/settings" className="impact-tile">
          <strong>~{hoursSaved}h</strong>
          <small>manual research saved (about 6 min per episode)</small>
        </a>
        {SECTIONS.map((sec) => (
          <a key={sec.kind} href={`#${sec.anchor}`} className="impact-tile">
            <strong>{counts[`${sec.kind}:${sec.funnel[sec.funnel.length - 1][0]}`]}</strong>
            <small>{sec.funnel[sec.funnel.length - 1][0].toLowerCase()}</small>
          </a>
        ))}
      </div>

      {SECTIONS.map((sec) => (
        <section key={sec.kind} id={sec.anchor} className="panel" style={{ marginTop: 16 }}>
          <div className="panel-top" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <h2>{sec.title}</h2>
              <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13 }}>{sec.why}</p>
            </div>
            <div className="funnel">
              {sec.funnel.map(([label]) => (
                <span key={label}>
                  <strong>{counts[`${sec.kind}:${label}`]}</strong> {label.toLowerCase()}
                </span>
              ))}
            </div>
          </div>
          {rows[sec.kind].length === 0 ? <p style={{ color: "var(--muted)", fontSize: 13 }}>Nothing in this week&apos;s brief yet.</p> : null}
          {rows[sec.kind].map((r) => {
            const s = status[`${sec.kind}:${r.id}`] ?? "draft";
            return (
              <div key={r.id} className="track-row">
                <Link href={r.href} className="track-name">
                  <strong>{r.name}</strong>
                  <small>{r.sub}</small>
                </Link>
                <div className="status-track" role="group" aria-label={`${sec.title} status for ${r.name}`}>
                  {sec.steps.map(([k, label]) => (
                    <button key={k} className={s === k ? "on" : ""} aria-pressed={s === k} onClick={() => mark(sec, r.id, k)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      ))}
      <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 12 }}>
        Click a status to record it, click again to undo. Open a name to copy the ready-made email, DM or SWOT. {msg ? `(${msg})` : ""}
      </p>
    </>
  );
}
