"use client";

import { CalendarDays, ChevronsLeft, ChevronsRight, Eye, Home, LogIn, LogOut, Megaphone, Menu, Radio, Settings, Sparkles, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/guests", label: "Guests", icon: Users },
  { href: "/topics", label: "Topics", icon: Sparkles },
  { href: "/sponsors", label: "Sponsors", icon: Megaphone },
  { href: "/settings", label: "Settings", icon: Settings },
];

export type ShellProps = {
  children: React.ReactNode;
  scan: { status: "ok" | "partial" | "failed" | "running" | "never"; label: string; when: string };
  period: string | null;
  sample: boolean;
  initialCollapsed: boolean;
  signedIn: boolean;
};

export function Shell({ children, scan, period, sample, initialCollapsed, signedIn }: ShellProps) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const toggle = () => {
    setCollapsed((c) => {
      document.cookie = `radar_collapsed=${c ? "0" : "1"}; path=/; max-age=31536000; samesite=lax`;
      return !c;
    });
  };

  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const dot = scan.status === "ok" ? "" : scan.status === "partial" || scan.status === "running" ? "amber" : scan.status === "failed" ? "red" : "idle";
  const title = NAV.find((n) => active(n.href))?.label ?? (path.startsWith("/reports") ? "Reports" : "");

  return (
    <div className={`app ${collapsed ? "collapsed" : ""}`}>
      <aside className={`sidebar ${open ? "open" : ""}`} aria-label="Sidebar" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
        <Link href="/" className="brand" aria-label="Podcast Radar home">
          <span className="brand-mark">
            <span className="sweep" aria-hidden />
            <Radio size={19} style={{ position: "relative" }} aria-hidden />
          </span>
          <span className="brand-text">
            <strong>Podcast Radar</strong>
            <span>India startup pods 📡</span>
          </span>
        </Link>
        <button className="sidebar-close" onClick={() => setOpen(false)} aria-label="Close navigation">
          <X size={18} />
        </button>
        <nav aria-label="Main navigation">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)} className={`nav-item ${active(href) ? "active" : ""}`} aria-current={active(href) ? "page" : undefined} title={collapsed ? label : undefined}>
              <Icon size={18} aria-hidden />
              <span className="label">{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="collapse-btn" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <ChevronsRight size={17} /> : <ChevronsLeft size={17} />}
            <span className="label">Collapse</span>
          </button>
          <Link href="/settings#runs" className="weekly-pill" title={`${scan.label} · ${scan.when}`}>
            <span className={`pulse ${dot} ${scan.status === "running" ? "live" : ""}`} aria-hidden />
            <span className="label-wrap">
              <strong>{scan.label}</strong>
              <small>{scan.when}</small>
            </span>
          </Link>
          <div className="me">
            <span className="avatar tone-1" style={{ width: 32, height: 32, fontSize: 12 }} aria-hidden>
              A
            </span>
            <span className="label-wrap">
              <strong>Aditya</strong>
              <small>Host</small>
            </span>
            {signedIn ? (
              <form action="/auth/signout" method="post" style={{ marginLeft: "auto" }}>
                <button className="signout" type="submit" aria-label="Sign out" title="Sign out">
                  <LogOut size={15} />
                </button>
              </form>
            ) : (
              <Link href="/login" className="signout" style={{ marginLeft: "auto" }} aria-label="Sign in to edit" title="Sign in to edit">
                <LogIn size={15} />
              </Link>
            )}
          </div>
        </div>
      </aside>
      {open ? <button className="mobile-scrim" aria-label="Close menu" onClick={() => setOpen(false)} /> : null}
      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="menu-button" onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu size={20} />
            </button>
            <span className="crumb">{title}</span>
            {sample ? (
              <span className="sample-note">
                <span aria-hidden /> Sample data · not live
              </span>
            ) : null}
            {!signedIn ? (
              <Link href="/login" className="view-only" title="Anyone with this link can view. Sign in to edit settings, run scans or write drafts.">
                <Eye size={13} aria-hidden /> View-only · sign in to edit
              </Link>
            ) : null}
          </div>
          <Link href="/reports" className="period-chip" title="Open the weekly brief archive">
            <CalendarDays size={15} aria-hidden />
            {period ?? "No brief yet"}
          </Link>
        </header>
        {children}
        <footer className="footer">
          <span>Podcast Radar 🎙️ · built for Aditya</span>
          <span>Observed counts come from public feeds · AI copy by Gemini Flash is labelled</span>
        </footer>
      </main>
    </div>
  );
}
