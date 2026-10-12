// Applies supabase/migrations/*.sql in order using SUPABASE_DB_URL (session pooler).
// Usage: npm run db:migrate
import "dotenv/config";
import { config } from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

config({ path: ".env.local" });

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("SUPABASE_DB_URL is not set (see .env.example)");
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(
    "create table if not exists _radar_migrations (name text primary key, applied_at timestamptz default now())",
  );
  const dir = join(process.cwd(), "supabase", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const done = await client.query("select 1 from _radar_migrations where name = $1", [file]);
    if (done.rowCount) continue;
    console.log(`applying ${file}`);
    await client.query("begin");
    try {
      await client.query(readFileSync(join(dir, file), "utf8"));
      await client.query("insert into _radar_migrations (name) values ($1)", [file]);
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw e;
    }
  }
  await client.end();
  console.log("migrations up to date");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
