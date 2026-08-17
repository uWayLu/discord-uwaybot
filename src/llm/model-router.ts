import OpenAI from "openai";
import { config } from "../config.js";

let activeModel: string = config.llmRouter.smartModel;

export function getActiveModel(): string {
  return activeModel;
}

export function currentModelLabel(): string {
  return activeModel;
}

async function probeLatency(model: string): Promise<number | null> {
  const probe = new OpenAI({
    apiKey: config.openai.apiKey,
    baseURL: config.openai.baseUrl,
    timeout: config.llmRouter.probeMaxMs + 5_000,
    maxRetries: 0,
  });
  const t0 = Date.now();
  try {
    await probe.chat.completions.create({
      model,
      messages: [{ role: "user", content: "ok" }],
      max_tokens: 5,
    });
    return Date.now() - t0;
  } catch (error) {
    console.warn("[MODEL] probe error:", (error as Error).message);
    return null;
  }
}

async function tick(): Promise<void> {
  if (!config.llmRouter.enabled) return;
  const latency = await probeLatency(config.llmRouter.smartModel);
  const healthy = latency != null && latency <= config.llmRouter.probeMaxMs;
  const next = healthy ? config.llmRouter.smartModel : config.llmRouter.fastModel;
  if (next !== activeModel) {
    console.log(
      `[MODEL] smart=${latency}ms ${healthy ? "healthy" : "slow"} -> switch to ${next}`,
    );
    activeModel = next;
  } else {
    console.log(
      `[MODEL] smart=${latency}ms ${healthy ? "healthy" : "slow"} -> keep ${activeModel}`,
    );
  }
}

let started = false;
export function startModelRouter(): void {
  if (started) return;
  started = true;
  void tick();
  const timer = setInterval(() => void tick(), config.llmRouter.intervalMs);
  timer.unref?.();
}
