// Seeds the 10-show config + topic taxonomy for Aditya (idempotent). Usage: npm run seed
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db, ownerId } = await import("@/lib/server/db");
  const { SEED_SHOWS, SEED_TOPICS } = await import("@/lib/server/seed-data");
  const { validatePodcast } = await import("@/lib/server/sources");
  const { slugify } = await import("@/lib/text");
  const sb = db();
  const owner = await ownerId();
  console.log("owner", owner);

  await sb.from("app_settings").upsert({ owner_id: owner }, { onConflict: "owner_id", ignoreDuplicates: true });
  const topicRows = SEED_TOPICS.map((t) => ({ owner_id: owner, name: t.name, slug: slugify(t.name), category: t.category, is_seed: true }));
  const tr = await sb.from("topics").upsert(topicRows, { onConflict: "owner_id,slug", ignoreDuplicates: true });
  if (tr.error) throw new Error(tr.error.message);
  console.log(`topics: ${topicRows.length} seeded`);

  for (const s of SEED_SHOWS) {
    const existing = (await sb.from("podcasts").select("id").eq("owner_id", owner).eq("name", s.name).maybeSingle()).data;
    if (existing) {
      console.log(`= ${s.name} (exists)`);
      continue;
    }
    const v = await validatePodcast({ rss_url: s.rss_url, youtube_channel_id: null, youtube_handle: s.youtube_handle, spotify_show_id: null, artwork_url: null });
    const ins = await sb.from("podcasts").insert({
      owner_id: owner,
      name: s.name,
      rss_url: s.rss_url,
      youtube_handle: s.youtube_handle,
      apple_collection_id: s.apple_collection_id,
      host_names: s.host_names,
      house_brands: s.house_brands,
      analyse_audio: true,
      active: v.status === "ok",
      validation_status: v.status,
      validation_detail: v.detail,
      ...v.patch,
    });
    if (ins.error) throw new Error(ins.error.message);
    console.log(`+ ${s.name}: ${v.status} — ${v.detail}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
