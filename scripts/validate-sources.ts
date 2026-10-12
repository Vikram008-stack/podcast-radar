// Re-validates every configured show (RSS fetch + YouTube channels.list). Usage: npm run sources:validate
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db, ownerId } = await import("@/lib/server/db");
  const { validatePodcast } = await import("@/lib/server/sources");
  const sb = db();
  const owner = await ownerId();
  const rows = (await sb.from("podcasts").select("*").eq("owner_id", owner).eq("is_sample", false).order("name")).data ?? [];
  const quota = { units: 0 };
  for (const p of rows) {
    const v = await validatePodcast(p, quota);
    await sb.from("podcasts").update({ validation_status: v.status, validation_detail: v.detail, ...v.patch }).eq("id", p.id);
    console.log(`${v.status === "ok" ? "✓" : "!"} ${p.name}: ${v.detail}${v.patch.youtube_channel_id ? ` [${v.patch.youtube_channel_id}]` : ""}`);
  }
  console.log(`YouTube units used: ${quota.units}`);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
