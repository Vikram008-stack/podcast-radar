import "server-only";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";

/**
 * Audio clipping for Gemini. Reads ONLY the opening `minutes` of an RSS enclosure with ffmpeg
 * (input-side -t stops the HTTP read early), writes a temporary mono 16 kHz low-bitrate MP3,
 * and deletes it right after use. Full episodes are never downloaded or stored.
 * YouTube and Spotify audio are never touched.
 */
// Bundled ffmpeg (ffmpeg-static) so audio runs on Vercel and locally; FFMPEG_PATH overrides.
const FFMPEG = process.env.FFMPEG_PATH || ffmpegStatic || "ffmpeg";
const INLINE_LIMIT = 14 * 1024 * 1024; // keep well under Gemini's ~20 MB inline request limit

export function ffmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const p = spawn(FFMPEG, ["-version"], { stdio: "ignore" });
      p.on("error", () => resolve(false));
      p.on("exit", (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
}

export type Clip = { data: Buffer; mimeType: "audio/mpeg"; bytes: number; inline: boolean; cleanup: () => Promise<void>; path: string };

export async function clipOpening(url: string, minutes: number, timeoutMs = 240_000): Promise<Clip> {
  if (!/^https?:\/\//i.test(url)) throw new Error("audio url must be http(s)");
  const dir = await mkdtemp(join(tmpdir(), "radar-audio-"));
  const out = join(dir, "clip.mp3");
  const cleanup = () => rm(dir, { recursive: true, force: true });
  try {
    // Node fetches the enclosure and pipes it into ffmpeg's stdin: static ffmpeg builds often can't
    // resolve hostnames on Linux (GitHub runners, Vercel), so ffmpeg never touches the network.
    // The download is aborted as soon as ffmpeg has the opening it needs.
    const ctrl = new AbortController();
    const res = await fetch(url, { headers: { "user-agent": "PodcastEcosystemRadar/1.0" }, redirect: "follow", signal: ctrl.signal });
    if (!res.ok || !res.body) throw new Error(`enclosure responded ${res.status}`);
    await new Promise<void>((resolve, reject) => {
      const args = ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-t", String(minutes * 60), "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", "-f", "mp3", "-y", out];
      const p = spawn(FFMPEG, args, { stdio: ["pipe", "ignore", "pipe"] });
      let err = "";
      p.stderr.on("data", (d) => (err = (err + String(d)).slice(-2000)));
      p.stdin.on("error", () => {}); // EPIPE once ffmpeg has enough — expected
      const timer = setTimeout(() => {
        ctrl.abort();
        p.kill("SIGKILL");
        reject(new Error("ffmpeg timed out"));
      }, timeoutMs);
      (async () => {
        try {
          const reader = res.body!.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done || p.exitCode !== null || p.stdin.destroyed) break;
            if (!p.stdin.write(value)) await new Promise((r) => p.stdin.once("drain", r));
          }
        } catch {
          // aborted after ffmpeg finished — expected
        } finally {
          p.stdin.end();
        }
      })();
      p.on("error", (e) => {
        clearTimeout(timer);
        reject(new Error(`ffmpeg not available: ${e.message}`));
      });
      p.on("close", (code, signal) => {
        clearTimeout(timer);
        ctrl.abort(); // stop downloading the rest of the episode
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited ${code ?? signal}: ${err.trim().slice(0, 200)}`));
      });
    });
    const { size } = await stat(out);
    if (size < 10_000) throw new Error("clip too small — enclosure unreadable");
    const data = await readFile(out);
    return { data, mimeType: "audio/mpeg", bytes: size, inline: size <= INLINE_LIMIT, cleanup, path: out };
  } catch (e) {
    await cleanup();
    throw e;
  }
}
