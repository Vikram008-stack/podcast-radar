import "server-only";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { env, geminiModels } from "@/lib/env";

/**
 * Gemini Flash client (the only AI used by the app).
 * - structured output (responseJsonSchema) + Zod validation; one repair retry, then null (→ needs_review)
 * - client-side rate limiter for free-tier RPM
 * - on a quota 429 the current model is marked exhausted and the next free-tier Flash model is tried
 * - per-run call budget so a run always keeps room for the brief
 */

export type AiLog = {
  prompt_name: string;
  prompt_version: string;
  model: string;
  input_kind: "text" | "audio";
  tokens_in: number | null;
  tokens_out: number | null;
  status: "ok" | "invalid" | "error" | "quota";
  error?: string;
};

export class GeminiUnavailable extends Error {}
/** Temporary overload on every model (503) — retry later; not a quota problem. */
export class GeminiBusy extends Error {}

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } } | { fileData: { mimeType: string; fileUri: string } };

export class Gemini {
  private client: GoogleGenAI;
  private models: string[];
  private exhausted = new Set<string>();
  private lastCall = 0;
  calls = 0;
  tokensIn = 0;
  tokensOut = 0;
  logs: AiLog[] = [];

  constructor(
    apiKey: string,
    private opts: { minIntervalMs?: number; maxCalls?: number } = {},
  ) {
    this.client = new GoogleGenAI({ apiKey });
    this.models = geminiModels();
  }

  static fromEnv(): Gemini | null {
    const key = env().GEMINI_API_KEY;
    return key ? new Gemini(key, { maxCalls: env().GEMINI_MAX_CALLS_PER_RUN }) : null;
  }

  get sdk() {
    return this.client;
  }

  remaining(): number {
    return (this.opts.maxCalls ?? 45) - this.calls;
  }

  available(): boolean {
    return this.remaining() > 0 && this.models.some((m) => !this.exhausted.has(m));
  }

  private async throttle() {
    const gap = this.opts.minIntervalMs ?? 6_500; // ~9 RPM, under free-tier limits
    const wait = this.lastCall + gap - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastCall = Date.now();
  }

  /**
   * Generate JSON validated by `schema`. Returns null when the output stays invalid after one
   * repair attempt. Throws GeminiUnavailable when budget/quota is exhausted on every model.
   */
  async json<T>(args: {
    name: string;
    version: string;
    system: string;
    parts: GeminiPart[];
    schema: z.ZodType<T>;
    inputKind?: "text" | "audio";
  }): Promise<T | null> {
    const jsonSchema = z.toJSONSchema(args.schema, { target: "draft-7" });
    let repair: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const parts = repair
        ? [...args.parts, { text: `Your previous output failed validation: ${repair}. Return corrected JSON only.` }]
        : args.parts;
      const raw = await this.generate(args, parts, jsonSchema);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        repair = "output was not valid JSON";
        continue;
      }
      const res = args.schema.safeParse(parsed);
      if (res.success) return res.data;
      repair = res.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      this.logs[this.logs.length - 1].status = "invalid";
    }
    return null;
  }

  private async generate(
    args: { name: string; version: string; system: string; inputKind?: "text" | "audio" },
    parts: GeminiPart[],
    jsonSchema: unknown,
  ): Promise<string> {
    let lastErr = "";
    let busy = 0;
    for (const model of this.models) {
      if (this.exhausted.has(model)) continue;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (this.remaining() <= 0) throw new GeminiUnavailable("Gemini call budget for this run is used up");
        await this.throttle();
        this.calls++;
        const log: AiLog = { prompt_name: args.name, prompt_version: args.version, model, input_kind: args.inputKind ?? "text", tokens_in: null, tokens_out: null, status: "ok" };
        this.logs.push(log);
        try {
          const res = await this.client.models.generateContent({
            model,
            contents: [{ role: "user", parts }],
            config: {
              systemInstruction: args.system,
              responseMimeType: "application/json",
              responseJsonSchema: jsonSchema,
              temperature: 0.2,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              // a hung request must never outlive a serverless invocation
              httpOptions: { timeout: args.inputKind === "audio" ? 180_000 : 90_000 },
            },
          });
          log.tokens_in = res.usageMetadata?.promptTokenCount ?? null;
          log.tokens_out = res.usageMetadata?.candidatesTokenCount ?? null;
          this.tokensIn += log.tokens_in ?? 0;
          this.tokensOut += log.tokens_out ?? 0;
          const text = res.text ?? "";
          if (!text) throw new Error("empty response");
          return text;
        } catch (e) {
          const msg = (e instanceof Error ? e.message : String(e)).replace(/key=[^&\s]+/g, "key=***");
          lastErr = msg.slice(0, 200);
          log.error = msg.slice(0, 300);
          if (/429|RESOURCE_EXHAUSTED|quota/i.test(msg)) {
            log.status = "quota";
            this.exhausted.add(model); // daily/minute quota → next free-tier Flash model
            break;
          }
          log.status = "error";
          if (/503|UNAVAILABLE|overloaded|high demand|500|INTERNAL|deadline|fetch failed|ECONNRESET/i.test(msg)) {
            busy++;
            if (attempt === 0) await new Promise((r) => setTimeout(r, 4_000));
            continue; // retry once, then fall over to the next model
          }
          throw new Error(`Gemini ${model}: ${lastErr}`);
        }
      }
    }
    if (busy) throw new GeminiBusy(`Gemini Flash models busy (503): ${lastErr}`);
    throw new GeminiUnavailable("All configured Gemini Flash models are out of free-tier quota");
  }
}
