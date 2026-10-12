import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser()) redirect("/");
  const { error } = await searchParams;
  return (
    <div className="login-wrap">
      <div className="login-card">
        <span className="brand-mark" style={{ width: 46, height: 46 }}>
          <span className="sweep" aria-hidden />
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ position: "relative" }} aria-hidden>
            <circle cx="12" cy="12" r="2" />
            <path d="M16.2 7.8a6 6 0 0 1 0 8.5M7.8 16.2a6 6 0 0 1 0-8.5M19.1 4.9a10 10 0 0 1 0 14.2M4.9 19.1a10 10 0 0 1 0-14.2" />
          </svg>
        </span>
        <h1>
          🎙️ Podcast <em>Radar</em> 📡
        </h1>
        <p>Sign in with your email — we&apos;ll send a one-tap magic link. This radar is private to Aditya.</p>
        {error === "denied" ? <p style={{ color: "#9a3f3a" }}>That account isn&apos;t allowed here.</p> : null}
        {error === "link" ? <p style={{ color: "#9a3f3a" }}>That link expired or was already used. Request a fresh one.</p> : null}
        <LoginForm />
      </div>
    </div>
  );
}
