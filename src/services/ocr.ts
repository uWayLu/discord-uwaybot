import { createWorker, type Worker } from "tesseract.js";
import { join } from "node:path";
import { config } from "../config.js";

const LANGS = ["eng", "chi_tra", "chi_sim"];
const LANGDATA = join(import.meta.dirname, "langdata");

let worker: Worker | null = null;
let workerPromise: Promise<Worker> | null = null;
let queue: Promise<string> = Promise.resolve("");

function ensureWorker(): Promise<Worker> {
  if (worker) return Promise.resolve(worker);
  if (!workerPromise) {
    workerPromise = createWorker(LANGS.join("+"), undefined, {
      langPath: LANGDATA,
      cachePath: import.meta.dirname,
      gzip: false,
    }).then((w) => {
      worker = w;
      workerPromise = null;
      return w;
    });
  }
  return workerPromise;
}

async function recognizeNow(buffer: Buffer): Promise<string> {
  const w = await ensureWorker();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error("OCR timeout")), 30_000);
  });
  try {
    const result = await Promise.race([w.recognize(buffer), timeout]);
    return (result.data?.text ?? "").trim();
  } catch (err) {
    console.error("[OCR] recognize failed:", err);
    try {
      await w.terminate();
    } catch {
      /* ignore */
    }
    worker = null;
    return "";
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function ocrBytes(buffer: Buffer): Promise<string> {
  const job = queue.then(() => recognizeNow(buffer));
  queue = job.catch(() => "");
  return job;
}

export async function ocrImageUrl(url: string): Promise<string> {
  if (!config.ocr.enabled) return "";
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[OCR] fetch failed: HTTP ${res.status}`);
      return "";
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return await ocrBytes(buf);
  } catch (err) {
    console.error("[OCR] fetch/ocr error:", err);
    return "";
  }
}