"use client";

import { Activity, CalendarClock, CheckCircle2, ChevronDown, ChevronUp, KeyRound, Loader2, Lock, Play, Plus, Radio, RefreshCw, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { IntegrationStatus } from "@/lib/env";
import { formatIst, formatIstDate } from "@/lib/time";

const DAY = 86_400_000;
function ago(iso: string) {
  const h = Math.round((Date.now() - Date.parse(iso)) / 3_600_000);
  return h < 1 ? "just now" : h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
const staleFetch = (iso: string | null) => !iso || Date.now() - Date.parse(iso) > 8 * DAY;
const freshClass = (iso: string | null | undefined) => (!iso ? "bad" : Date.now() - Date.parse(iso) > 14 * DAY ? "warn" : "");
import { Artwork, Badge } from "./ui";

export type PodcastView = {
  id: string;
  name: string;
  rss_url: string | null;
  youtube_channel_id: string | null;
  youtube_handle: string | null;
  spotify_show_id: string | null;
  apple_collection_id: string | null;
  artwork_url: string | null;
  host_names: string[];
  house_brands: string[];
  analyse_audio: boolean;
  min_episode_minutes: number | null;
  active: boolean;
  validation_status: "unverified" | "ok" | "needs_attention";
  validation_detail: string | null;
  last_success_at: string | null;
  last_attempt_at: string | null;
  last_error: string | null;
  health?: { found: number; processed: number; newest: string | null };
};

export type JobView = {
  id: string;
  type: string;
  trigger: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  error_summary: string | null;
  provider_calls: Record<string, number> | null;
  period_key: string | null;
};

type Settings = { timezone: string; report_time: string; min_episode_minutes: number; last_manual_run_at: string | null };
type AppleHit = { kind: "apple"; collectionId: string; name: string; artist: string | null; feedUrl: string | null; artwork: string | null; lastRelease: string | null };
type ChannelHit = { kind: "youtube" | "spotify"; id: string; name: string; artist: string | null; artwork: string | null; url: string };
type Hit = AppleHit | ChannelHit;
const SOURCES = [
  { key: "apple", label: "Apple Podcasts", note: "free · finds the official RSS feed" },
  { key: "youtube", label: "YouTube", note: "uses 100 of 10,000 daily units" },
  { key: "spotify", label: "Spotify", note: "uses 1 of 150 monthly requests" },
] as const;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message ?? `Request failed (${res.status})`);
  return j as T;
}

const csv = (xs: string[]) => xs.join(", ");
const uncsv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function SettingsClient({ podcasts, settings, jobs, integrations, now, canEdit }: { podcasts: PodcastView[]; settings: Settings; jobs: JobView[]; integrations: IntegrationStatus[]; now: number; canEdit: boolean }) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const say = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 4200);
  };
  async function run<T>(key: string, fn: () => Promise<T>, ok?: string) {
    setBusy(key);
    try {
      const r = await fn();
      if (ok) say(ok);
      router.refresh();
      return r;
    } catch (e) {
      say(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const running = jobs.find((j) => j.status === "running" && j.type === "weekly");
  const cooldownUntil = settings.last_manual_run_at ? new Date(settings.last_manual_run_at).getTime() + 15 * 60_000 : 0;
  const coolingDown = cooldownUntil > now;

  return (
    <>
      <header className="page-header settings-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, maxWidth: "none", flexWrap: "wrap" }}>
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Your radar, your rules</h1>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>Pick the shows to monitor, check collection health, and run a scan on demand.</p>
        </div>
        {canEdit ? (
        <button
          className="button primary"
          disabled={!!busy || !!running || coolingDown}
          onClick={() => run("scan", () => api<{ message: string }>("/api/jobs/run", { method: "POST", body: "{}" }).then((r) => say(r.message)))}
          title={coolingDown ? `Available again at ${formatIst(new Date(cooldownUntil))}` : "Runs the same weekly job now"}
        >
          {busy === "scan" || running ? <Loader2 size={15} className="spin" /> : <Play size={15} />}
          {running ? "Scan running…" : coolingDown ? "Scan cooling down" : "Run scan now"}
        </button>
        ) : (
          <a className="button soft" href="/login">
            <Lock size={15} /> Sign in to edit
          </a>
        )}
      </header>

      <div className="settings-layout">
        <section className="settings-card">
          <div className="settings-card-head">
            <div>
              <h2>Podcast sources</h2>
              <p style={{ margin: "6px 0 0" }}>
                {podcasts.filter((p) => p.active).length} of {podcasts.length} shows active. Add a show by name (Apple Podcasts finds its official RSS feed) or paste its feeds.
              </p>
            </div>
          </div>
          {canEdit ? <AddSource busy={busy} run={run} /> : null}
          {podcasts.map((p) => (
            <SourceRow key={p.id} p={p} busy={busy} run={run} canEdit={canEdit} />
          ))}
        </section>

        <aside>
          <section className="settings-card schedule">
            <span className="mini-icon">
              <CalendarClock size={18} />
            </span>
            <h2>Report schedule</h2>
            <p>The brief is generated every <strong>Monday</strong>. Only the time and timezone are editable.</p>
            {canEdit ? (
              <ScheduleForm settings={settings} busy={busy} run={run} />
            ) : (
              <p>
                Current: <strong>Monday {settings.report_time}</strong> · {settings.timezone}
              </p>
            )}
          </section>

          <section className="settings-card" id="runs">
            <span className="mini-icon">
              <Activity size={18} />
            </span>
            <h2>Collection health</h2>
            {jobs.length === 0 ? <p>No scans yet.</p> : null}
            {jobs.map((j) => (
              <div key={j.id} className="health-row">
                <span className={`health-dot ${j.status === "succeeded" ? "" : j.status === "partial" || j.status === "running" ? "amber" : "red"}`} />
                <div style={{ minWidth: 0 }}>
                  <strong>
                    {j.type === "weekly" ? `Weekly scan · ${j.period_key ?? ""}` : j.type.replace("_", " ")} — {j.status}
                  </strong>
                  <small>
                    {j.trigger} · {formatIst(j.started_at)}
                    {j.provider_calls
                      ? ` · YouTube ${j.provider_calls.youtube_units ?? 0}u · Spotify ${j.provider_calls.rapidapi_requests ?? 0} req · Gemini ${j.provider_calls.gemini_calls ?? 0} calls`
                      : ""}
                  </small>
                  {j.error_summary ? <small style={{ color: "#8a5a2c" }}>{j.error_summary.slice(0, 220)}</small> : null}
                </div>
              </div>
            ))}
          </section>

          <section className="settings-card">
            <span className="mini-icon">
              <KeyRound size={18} />
            </span>
            <h2>Integration status</h2>
            <p>Which keys are configured on the server. Values are never shown.</p>
            {integrations.map((i) => (
              <div key={i.key} className="health-row">
                <span className={`health-dot ${i.configured ? "" : "grey"}`} />
                <div>
                  <strong>
                    {i.label} {i.configured ? <Badge tone="sage">Configured</Badge> : <Badge tone="neutral">Missing</Badge>}
                  </strong>
                  <small>{i.note}</small>
                </div>
              </div>
            ))}
          </section>

          <section className="settings-card" id="method">
            <span className="mini-icon">
              <ShieldCheck size={18} />
            </span>
            <h2>How counts work</h2>
            <p>
              <strong>Observed</strong> numbers are counted straight from feeds: one merged episode per release (RSS, YouTube and Spotify copies within 3 days are merged), YouTube videos under the
              minimum length are treated as clips. <strong>Confirmed</strong> sponsorship needs a disclosure phrase in the stored evidence; a show&apos;s own brands never count.
              Everything marked <strong>AI interpretation</strong> was written by Gemini Flash from cited sources.
            </p>
          </section>
        </aside>
      </div>
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </>
  );
}

type RunFn = <T>(key: string, fn: () => Promise<T>, ok?: string) => Promise<T | undefined>;

function AddSource({ busy, run }: { busy: string | null; run: RunFn }) {
  const [mode, setMode] = useState<"search" | "manual">("search");
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [source, setSource] = useState<(typeof SOURCES)[number]["key"]>("apple");
  const [form, setForm] = useState({ name: "", rss_url: "", youtube: "", spotify: "", host_names: "", house_brands: "", apple_collection_id: "", artwork_url: "" });

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (term.trim().length < 2) return;
    const r = await run("search", () => api<{ results: Hit[] }>(`/api/podcasts/lookup?source=${source}&q=${encodeURIComponent(term.trim())}`));
    setHits(r?.results ?? []);
  }

  function pick(h: Hit) {
    // Picks accumulate: e.g. Apple (RSS) + YouTube channel + Spotify show for the same show.
    if (h.kind === "apple") setForm((f) => ({ ...f, name: f.name || h.name, rss_url: h.feedUrl ?? "", apple_collection_id: h.collectionId, artwork_url: h.artwork ?? f.artwork_url }));
    else if (h.kind === "youtube") setForm((f) => ({ ...f, name: f.name || h.name, youtube: h.id, artwork_url: f.artwork_url || (h.artwork ?? "") }));
    else setForm((f) => ({ ...f, name: f.name || h.name, spotify: h.url }));
    setMode("manual");
    setHits(null);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const res = await run(
      "add",
      () =>
        api<{ podcast: { validation_status: string; validation_detail: string } }>("/api/podcasts", {
          method: "POST",
          body: JSON.stringify({
            name: form.name,
            rss_url: form.rss_url || null,
            youtube: form.youtube || null,
            spotify: form.spotify || null,
            host_names: uncsv(form.host_names),
            house_brands: uncsv(form.house_brands),
            apple_collection_id: form.apple_collection_id || null,
            artwork_url: form.artwork_url || null,
          }),
        }),
    );
    if (res) {
      setForm({ name: "", rss_url: "", youtube: "", spotify: "", host_names: "", house_brands: "", apple_collection_id: "", artwork_url: "" });
      setTerm("");
    }
  }

  return (
    <div className="add-source">
      <div className="tabs" style={{ height: "auto", padding: 0, border: 0 }} role="tablist">
        <button role="tab" aria-selected={mode === "search"} className={mode === "search" ? "active" : ""} style={{ height: 34 }} onClick={() => setMode("search")}>
          Find by name
        </button>
        <button role="tab" aria-selected={mode === "manual"} className={mode === "manual" ? "active" : ""} style={{ height: 34 }} onClick={() => setMode("manual")}>
          Paste feeds
        </button>
      </div>
      {mode === "search" ? (
        <form onSubmit={search} className="add-row">
          <select className="select" value={source} onChange={(e) => { setSource(e.target.value as typeof source); setHits(null); }} aria-label="Search in" title={SOURCES.find((x) => x.key === source)?.note}>
            {SOURCES.map((x) => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
          </select>
          <input className="field" placeholder="Show name, e.g. The Neon Show" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Show name" />
          <button className="button soft" disabled={busy === "search"} type="submit">
            {busy === "search" ? <Loader2 size={14} className="spin" /> : <Search size={14} />} Search
          </button>
        </form>
      ) : (
        <form onSubmit={add} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="source-edit" style={{ marginTop: 0, background: "transparent", padding: 0 }}>
            <label>
              Show name *
              <input className="field" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              RSS feed URL
              <input className="field" type="url" placeholder="https://…" value={form.rss_url} onChange={(e) => setForm({ ...form, rss_url: e.target.value })} />
            </label>
            <label>
              YouTube channel URL or @handle
              <input className="field" placeholder="@channel" value={form.youtube} onChange={(e) => setForm({ ...form, youtube: e.target.value })} />
            </label>
            <label>
              Spotify show URL (optional)
              <input className="field" placeholder="https://open.spotify.com/show/…" value={form.spotify} onChange={(e) => setForm({ ...form, spotify: e.target.value })} />
            </label>
            <label>
              Host names (comma-separated)
              <input className="field" value={form.host_names} onChange={(e) => setForm({ ...form, host_names: e.target.value })} />
            </label>
            <label>
              House brands (comma-separated)
              <input className="field" value={form.house_brands} onChange={(e) => setForm({ ...form, house_brands: e.target.value })} />
            </label>
          </div>
          <button className="button primary" type="submit" disabled={busy === "add"} style={{ alignSelf: "flex-start" }}>
            {busy === "add" ? <Loader2 size={14} className="spin" /> : <Plus size={14} />} Add &amp; validate
          </button>
        </form>
      )}
      {hits ? (
        <div className="apple-results">
          {hits.length === 0 ? <small style={{ color: "var(--muted)" }}>No matches.</small> : null}
          {hits.map((h) =>
            h.kind === "apple" ? (
              <button key={h.collectionId} className="apple-hit" onClick={() => pick(h)} disabled={!h.feedUrl}>
                <Artwork src={h.artwork} alt="" />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{h.name}</strong>
                  <small>
                    {h.artist ?? "Unknown publisher"} · {h.feedUrl ? "RSS feed found" : "no public RSS feed"}
                    {h.lastRelease ? ` · last episode ${h.lastRelease.slice(0, 10)}` : ""}
                  </small>
                </span>
                <Badge tone={h.feedUrl ? "lavender" : "neutral"}>{h.feedUrl ? "Use RSS" : "Unavailable"}</Badge>
              </button>
            ) : (
              <button key={h.id} className="apple-hit" onClick={() => pick(h)}>
                <Artwork src={h.artwork} alt="" />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{h.name}</strong>
                  <small>{h.artist ?? (h.kind === "youtube" ? "YouTube channel" : "Spotify show")}</small>
                </span>
                <Badge tone="lavender">{h.kind === "youtube" ? "Use channel" : "Use Spotify"}</Badge>
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

function SourceRow({ p, busy, run, canEdit }: { p: PodcastView; busy: string | null; run: RunFn; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    rss_url: p.rss_url ?? "",
    youtube: p.youtube_handle ? `@${p.youtube_handle}` : p.youtube_channel_id ?? "",
    spotify: p.spotify_show_id ? `https://open.spotify.com/show/${p.spotify_show_id}` : "",
    host_names: csv(p.host_names),
    house_brands: csv(p.house_brands),
    min_episode_minutes: p.min_episode_minutes ? String(p.min_episode_minutes) : "",
  });
  const patch = (body: Record<string, unknown>, ok?: string) => run(`p:${p.id}`, () => api(`/api/podcasts/${p.id}`, { method: "PATCH", body: JSON.stringify(body) }), ok);
  const status = !p.active ? ["Disabled", "grey"] : p.validation_status === "ok" ? (p.last_error ? ["Partial", "amber"] : ["Healthy", ""]) : p.validation_status === "needs_attention" ? ["Needs attention", "red"] : ["Unverified", "amber"];
  const rowBusy = busy === `p:${p.id}` || busy === `v:${p.id}`;

  return (
    <div className="source-row">
      <div className="source-row-main">
        <Artwork src={p.artwork_url} alt="" />
        <div className="source-main" style={{ minWidth: 0 }}>
          <strong>{p.name}</strong>
          <small>
            {[p.rss_url ? "RSS" : null, p.youtube_channel_id || p.youtube_handle ? "YouTube" : null, p.spotify_show_id ? "Spotify" : null].filter(Boolean).join(" · ") || "No feeds"}
            {p.analyse_audio && p.rss_url ? " · audio openings on" : ""}
          </small>
        </div>
        <div className="source-status">
          <small>
            <span className={`health-dot ${status[1]}`} style={{ display: "inline-block", marginRight: 6, marginTop: 0 }} />
            {status[0]}
          </small>
          <small>Last success {p.last_success_at ? formatIst(p.last_success_at) : "—"}</small>
        </div>
        {canEdit ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className={`toggle ${p.active ? "on" : ""}`} role="switch" aria-checked={p.active} aria-label={`${p.active ? "Disable" : "Enable"} ${p.name}`} disabled={rowBusy} onClick={() => patch({ active: !p.active }, p.active ? `${p.name} disabled` : `${p.name} enabled`)}>
              <span />
            </button>
            <button className="icon-button" style={{ background: "none", border: 0, padding: 6 }} aria-expanded={open} aria-label={`Edit ${p.name}`} onClick={() => setOpen(!open)}>
              {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        ) : (
          <Badge tone={p.active ? "sage" : "neutral"}>{p.active ? "Active" : "Off"}</Badge>
        )}
      </div>
      <div className="health-chips">
        <span title="Episodes published in the last 30 days that were collected">📥 {p.health?.found ?? 0} found</span>
        <span title="Of those, analysed by Gemini" className={p.health && p.health.found > p.health.processed ? "warn" : ""}>🧠 {p.health?.processed ?? 0} analysed</span>
        <span title="Newest episode collected" className={freshClass(p.health?.newest)}>🕒 newest {p.health?.newest ? formatIstDate(p.health.newest) : "none in 30 days"}</span>
        <span title="Last successful fetch" className={staleFetch(p.last_success_at) ? "warn" : ""}>🔄 fetched {p.last_success_at ? ago(p.last_success_at) : "never"}</span>
      </div>
      {p.last_error ? <small style={{ display: "block", marginTop: 6, color: "#8a5a2c", fontSize: 12 }}>Last error: {p.last_error}</small> : null}
      {open ? (
        <div className="source-edit">
          <label>
            RSS feed URL
            <input className="field" value={f.rss_url} onChange={(e) => setF({ ...f, rss_url: e.target.value })} />
          </label>
          <label>
            YouTube channel / @handle
            <input className="field" value={f.youtube} onChange={(e) => setF({ ...f, youtube: e.target.value })} />
          </label>
          <label>
            Spotify show URL
            <input className="field" value={f.spotify} onChange={(e) => setF({ ...f, spotify: e.target.value })} />
          </label>
          <label>
            Min. episode length (minutes)
            <input className="field" type="number" min={1} max={240} placeholder="Default 20" value={f.min_episode_minutes} onChange={(e) => setF({ ...f, min_episode_minutes: e.target.value })} />
          </label>
          <label>
            Host names (never counted as guests)
            <input className="field" value={f.host_names} onChange={(e) => setF({ ...f, host_names: e.target.value })} />
          </label>
          <label>
            House brands (related-party, not sponsors)
            <input className="field" value={f.house_brands} onChange={(e) => setF({ ...f, house_brands: e.target.value })} />
          </label>
          <div className="toggle-row" style={{ gridColumn: "1 / -1" }}>
            <button className={`toggle ${p.analyse_audio ? "on" : ""}`} role="switch" aria-checked={p.analyse_audio} aria-label="Analyse audio" disabled={rowBusy} onClick={() => patch({ analyse_audio: !p.analyse_audio })}>
              <span />
            </button>
            <span>
              <strong>Analyse audio</strong> — Gemini listens to the first minutes of new RSS episodes for spoken sponsor reads and guest intros
            </span>
          </div>
          {p.validation_detail ? <small style={{ gridColumn: "1 / -1", color: "var(--muted)", fontSize: 12 }}>Validation: {p.validation_detail}</small> : null}
          <div className="draft-actions" style={{ gridColumn: "1 / -1" }}>
            <button
              className="button primary sm"
              disabled={rowBusy}
              onClick={() =>
                patch(
                  {
                    rss_url: f.rss_url || null,
                    youtube: f.youtube || null,
                    spotify: f.spotify || null,
                    host_names: uncsv(f.host_names),
                    house_brands: uncsv(f.house_brands),
                    min_episode_minutes: f.min_episode_minutes ? Number(f.min_episode_minutes) : null,
                  },
                  "Saved — re-validated",
                )
              }
            >
              <CheckCircle2 size={13} /> Save &amp; validate
            </button>
            <button className="button soft sm" disabled={rowBusy} onClick={() => run(`v:${p.id}`, () => api(`/api/podcasts/${p.id}/validate`, { method: "POST", body: "{}" }), "Validation finished")}>
              <RefreshCw size={13} className={busy === `v:${p.id}` ? "spin" : ""} /> Validate
            </button>
            <button className="button soft sm" disabled={rowBusy || !p.active} onClick={() => run(`v:${p.id}`, () => api<{ message: string }>(`/api/podcasts/${p.id}/sync`, { method: "POST", body: "{}" }), "Show synced")}>
              <Radio size={13} /> Sync now
            </button>
            <button
              className="button danger sm"
              disabled={rowBusy}
              onClick={() => {
                if (confirm(`Remove ${p.name} and its collected episodes? Past frozen briefs are kept.`)) run(`p:${p.id}`, () => api(`/api/podcasts/${p.id}`, { method: "DELETE" }), `${p.name} removed`);
              }}
            >
              <Trash2 size={13} /> Remove
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ScheduleForm({ settings, busy, run }: { settings: Settings; busy: string | null; run: RunFn }) {
  const [time, setTime] = useState(settings.report_time);
  const [tz, setTz] = useState(settings.timezone);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run("sched", () => api("/api/settings", { method: "PATCH", body: JSON.stringify({ report_time: time, timezone: tz }) }), "Schedule saved");
      }}
    >
      <label>
        Day
        <input className="field" value="Monday" disabled aria-readonly />
      </label>
      <label>
        Time
        <input className="field" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
      </label>
      <label>
        Timezone
        <select className="select" value={tz} onChange={(e) => setTz(e.target.value)}>
          {["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "America/Los_Angeles", "UTC"].map((z) => (
            <option key={z}>{z}</option>
          ))}
        </select>
      </label>
      <small style={{ display: "block", color: "var(--muted)", fontSize: 12, marginBottom: 10 }}>
        The GitHub Actions schedule runs Mondays 06:00 IST; if you change the time, update the cron line in .github/workflows/weekly-brief.yml too (docs/DEPLOYMENT.md). The daily catch-up uses this value.
      </small>
      <button className="button soft" type="submit" disabled={busy === "sched"} style={{ width: "100%" }}>
        Save schedule
      </button>
    </form>
  );
}
