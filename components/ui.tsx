import { ArrowUpRight, AudioLines, Eye, FileText, Lock, MonitorPlay, Sparkles } from "lucide-react";
import Link from "next/link";
import type { AiClaim, Evidence, EvidenceType } from "@/lib/shared/types";
import { initials } from "@/lib/text";
import { formatTimestamp } from "@/lib/time";

export function Badge({ tone = "neutral", children }: { tone?: "lavender" | "blush" | "sage" | "sand" | "neutral" | "ink"; children: React.ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

type BtnProps = { variant?: "primary" | "soft" | "ghost" | "danger"; size?: "sm"; href?: string; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>;
export function Button({ variant = "soft", size, href, children, className = "", ...rest }: BtnProps) {
  const cls = `button ${variant} ${size ?? ""} ${className}`;
  if (href) return <Link className={cls} href={href}>{children}</Link>;
  return <button className={cls} {...rest}>{children}</button>;
}

/** A real external link (new tab). Renders nothing clickable when there is no URL. */
export function SourceLink({ href, children }: { href: string | null | undefined; children: React.ReactNode }) {
  if (!href) return <span className="source-link" style={{ textDecoration: "none", color: "var(--muted)" }}>{children} (no link)</span>;
  return (
    <a className="source-link" href={href} target="_blank" rel="noopener noreferrer">
      {children} <ArrowUpRight size={12} aria-hidden />
    </a>
  );
}

export function SectionTitle({ eyebrow, title, sub, action }: { eyebrow: string; title: string; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="section-title">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {sub ? <p>{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}

export const RANKING_RULES = {
  guests: "Distinct shows ↓ → appearances ↓ → latest appearance ↓ → name · last 30 days · top 3 featured",
  topics: "Distinct shows ↓ → episodes ↓ → change vs previous week ↓ · reporting week · top 3 featured",
  sponsors: "Confirmed sponsors first, then promotions · distinct shows ↓ → placements ↓ → latest ↓ · last 30 days",
} as const;

export function RankingMethod({ kind }: { kind: keyof typeof RANKING_RULES }) {
  return (
    <div className="method-bar">
      <div>
        <Eye size={15} aria-hidden />
        <span>
          <strong>Ranking method</strong>
          {RANKING_RULES[kind]}
        </span>
      </div>
      <Link className="source-link" href="/settings#method" style={{ color: "var(--sage-deep)" }}>
        How counts work
      </Link>
    </div>
  );
}

const TONES = 5;
export function toneFor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `tone-${h % TONES}`;
}

export function Avatar({ name, size }: { name: string; size?: "md" | "lg" }) {
  return (
    <span className={`avatar ${size ?? ""} ${toneFor(name)}`} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function Artwork({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt={alt} className={className} loading="lazy" referrerPolicy="no-referrer" /> : <span className={`ph ${className ?? ""}`} aria-hidden />;
}

export function AiLabel({ children = "AI interpretation" }: { children?: React.ReactNode }) {
  return (
    <span className="label-ai" title="Written by Gemini Flash from the cited sources. Check before using.">
      <Sparkles size={13} aria-hidden /> {children}
    </span>
  );
}

export function ObservedLabel({ children = "Observed" }: { children?: React.ReactNode }) {
  return (
    <span className="label-observed" title="Counted directly from public feeds — no AI judgement.">
      <Eye size={13} aria-hidden /> {children}
    </span>
  );
}

const EV_LABEL: Record<EvidenceType, string> = {
  title: "Episode title",
  show_notes: "Show notes",
  youtube_description: "YouTube description",
  spotify_description: "Spotify description",
  audio: "Episode audio",
};

export function EvidenceIcon({ type }: { type: EvidenceType }) {
  if (type === "audio") return <AudioLines size={13} aria-hidden />;
  if (type === "youtube_description") return <MonitorPlay size={13} aria-hidden />;
  return <FileText size={13} aria-hidden />;
}

export function evidenceCaption(e: Evidence) {
  if (e.type === "audio" && e.audioTimestampS != null) return `Heard at ${formatTimestamp(e.audioTimestampS)} in episode audio`;
  return EV_LABEL[e.type];
}

export function EvidenceList({ items }: { items: Evidence[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((e, i) => (
        <div key={i}>
          <span className="badge neutral">
            <EvidenceIcon type={e.type} /> {evidenceCaption(e)}
          </span>
          <p className={`quote ${e.type === "audio" ? "audio" : ""}`}>“{e.excerpt}”</p>
          <div style={{ marginTop: 6 }}>
            <SourceLink href={e.url}>Open source</SourceLink>
          </div>
        </div>
      ))}
    </div>
  );
}

/** AI claims with their cited sources. */
export function ClaimList({ claims, sources }: { claims: AiClaim[]; sources: Map<string, { label: string; url: string | null }> }) {
  return (
    <ul className="claim-list">
      {claims.map((c, i) => (
        <li key={i}>
          {c.claim}
          <div className="cites">
            {c.source_ids.map((id) => {
              const s = sources.get(id);
              return s ? (
                <SourceLink key={id} href={s.url}>
                  {s.label.length > 48 ? s.label.slice(0, 46) + "…" : s.label}
                </SourceLink>
              ) : null;
            })}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <span className="art">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
          <rect x="9" y="2.5" width="6" height="11" rx="3" />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
          <path d="M19.5 4.5l1-1M21 7h1.2" opacity=".6" />
        </svg>
      </span>
      <h3>{title}</h3>
      {children ? <div style={{ maxWidth: 440, margin: "0 auto", lineHeight: 1.6 }}>{children}</div> : null}
      {action ? <div style={{ marginTop: 16 }}>{action}</div> : null}
    </div>
  );
}

export function ChangePill({ change }: { change: number | null }) {
  if (change === null) return <Badge tone="sand">New</Badge>;
  const pct = Math.round(change * 100);
  return <Badge tone={pct > 0 ? "sage" : pct < 0 ? "blush" : "neutral"}>{pct > 0 ? `+${pct}%` : `${pct}%`} vs last week</Badge>;
}

const CLASS_LABEL = {
  confirmed: ["Confirmed", "sage"],
  affiliate: ["Promotion · code / referral", "sand"],
  probable: ["Featured brand", "lavender"],
  related_party: ["Related-party", "neutral"],
  organic: ["Organic mention", "neutral"],
} as const;

export function ClassBadge({ cls }: { cls: keyof typeof CLASS_LABEL }) {
  const [label, tone] = CLASS_LABEL[cls];
  return <Badge tone={tone}>{label}</Badge>;
}

export function fmtNum(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-IN", { notation: n >= 100_000 ? "compact" : "standard" }).format(n);
}

/** Shown to public viewers where an action needs Aditya's sign-in. */
export function LockedPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ textAlign: "center", padding: "10px 4px" }}>
      <span className="mini-icon" style={{ margin: "0 auto 12px" }} aria-hidden>
        <Lock size={17} />
      </span>
      <strong style={{ display: "block", fontSize: 15 }}>{title}</strong>
      <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6, margin: "6px 0 14px" }}>{children}</p>
      <Link className="button soft sm" href="/login">
        Sign in to edit
      </Link>
    </div>
  );
}
