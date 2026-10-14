"use client";

import { Check, Copy, RefreshCw, Sparkles } from "lucide-react";
import { useState } from "react";
import type { DraftTemplate } from "@/lib/outreach-templates";

type Draft = { subject: string; body: string; updated_at?: string; status?: string } | null;
/** Editable draft. Never sent anywhere — edits save quietly on blur, Copy puts it on the clipboard. Status is tracked on the Impact page. */
export function DraftEditor({ endpoint, reportId, initial, kind, templates = [] }: { endpoint: string; reportId: string; initial: Draft; kind: "outreach" | "pitch"; templates?: DraftTemplate[] }) {
  // Opens with the saved draft, or a ready-made template built from this page's evidence.
  // A status-only row (no text yet) counts as no draft, so the template still shows.
  initial = initial && (initial.subject || initial.body) ? initial : null;
  const [subject, setSubject] = useState(initial?.subject ?? templates[0]?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? templates[0]?.body ?? "");
  const [active, setActive] = useState<string | null>(initial ? null : (templates[0]?.key ?? null));
  const [busy, setBusy] = useState<"gen" | "save" | null>(null);
  const [msg, setMsg] = useState<string | null>(initial?.updated_at ? "Saved draft loaded" : null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(`${initial?.subject ?? ""}
${initial?.body ?? ""}`);

  // Quiet autosave when a field loses focus and the text changed.
  async function autosave() {
    const key = `${subject}
${body}`;
    if (busy || key === saved || (!subject && !body)) return;
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save", reportId, subject, body }) });
      if (res.ok) setSaved(key);
    } catch {
      /* keep the text on screen; Copy still works */
    }
  }

  async function call(action: "generate" | "save") {
    setBusy(action === "generate" ? "gen" : "save");
    setMsg(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "generate" ? { action, reportId } : { action, reportId, subject, body }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error?.message ?? "Request failed");
      setSubject(j.draft.subject);
      setBody(j.draft.body);
      setSaved(`${j.draft.subject}
${j.draft.body}`);
      setMsg(action === "generate" ? "New draft generated — edit freely" : "Saved");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setMsg("Copy blocked by the browser — select the text manually");
    }
  }

  const empty = !subject && !body;
  return (
    <div>
      <div className="panel-top">
        <div>
          <p className="eyebrow">{kind === "outreach" ? "Outreach draft" : "Sponsor pitch draft"}</p>
          <span className="label-ai">
            <Sparkles size={13} aria-hidden /> Draft · never sent automatically
          </span>
        </div>
      </div>
      {templates.length ? (
        <div className="tabs" role="tablist" aria-label="Draft type" style={{ height: "auto", padding: "4px 0 8px", border: 0 }}>
          {templates.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={active === t.key}
              className={active === t.key ? "active" : ""}
              style={{ height: 32 }}
              onClick={() => {
                setSubject(t.subject);
                setBody(t.body);
                setActive(t.key);
                setMsg(`${t.label} template loaded — fill the [brackets] and copy`);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}
      {empty ? (
        <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6 }}>
          Generate a first draft from the evidence on this page, then make it yours.
        </p>
      ) : null}
      <label>
        Subject
        <input className="field" value={subject} onChange={(e) => setSubject(e.target.value)} onBlur={autosave} placeholder="Subject line" />
      </label>
      <label>
        Message
        <textarea className="field" rows={11} value={body} onChange={(e) => setBody(e.target.value)} onBlur={autosave} placeholder="Draft body" />
      </label>
      <div className="draft-actions">
        <button className="button primary sm" onClick={() => call("generate")} disabled={!!busy}>
          <RefreshCw size={13} className={busy === "gen" ? "spin" : ""} /> {busy === "gen" ? "Writing…" : "Rewrite with AI"}
        </button>
        <button className="button soft sm" onClick={copy} disabled={empty}>
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {msg ? <small style={{ color: "var(--muted)", fontSize: 12 }} role="status">{msg}</small> : null}
    </div>
  );
}
