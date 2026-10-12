"use client";

import { Mail } from "lucide-react";
import { useState } from "react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    if (res.ok) setState("sent");
    else {
      const j = await res.json().catch(() => ({}));
      setMsg(j?.error?.message ?? "Something went wrong");
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className="panel" style={{ marginTop: 18, background: "var(--sage)", borderColor: "#d3e0cf" }}>
        <strong>Check your inbox ✉️</strong>
        <p style={{ margin: "6px 0 0", fontSize: 13 }}>If {email} is the radar&apos;s owner address, a sign-in link is on its way. Open it in this browser.</p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
      <label htmlFor="email" style={{ fontSize: 12, fontWeight: 600, color: "#5f5a62" }}>
        Email
      </label>
      <input id="email" className="field" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button className="button primary" type="submit" disabled={state === "sending"}>
        <Mail size={15} /> {state === "sending" ? "Sending…" : "Send magic link"}
      </button>
      {state === "error" ? <p style={{ color: "#9a3f3a", fontSize: 13, margin: 0 }}>{msg}</p> : null}
    </form>
  );
}
