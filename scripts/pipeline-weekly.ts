// Weekly pipeline entry point (GitHub Actions + local). Usage: npm run pipeline:weekly [-- --trigger=manual --no-audio]
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { runWeekly } = await import("@/lib/server/pipeline/weekly");
  const args = process.argv.slice(2);
  const trigger = (args.find((a) => a.startsWith("--trigger="))?.split("=")[1] ?? "cli") as "schedule" | "manual" | "cli";
  const audio = args.includes("--no-audio") ? "mark" : "analyse";
  const res = await runWeekly({ trigger, audio });
  console.log(JSON.stringify({ scope: "pipeline", result: res }));
  if (res.status === "failed") process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
