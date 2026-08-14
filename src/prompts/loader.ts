import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.js";

/**
 * 讀取指定 prompt 檔；若 persona 開啟，則在開頭注入 persona.txt。
 * 位在 src/prompts/（與各 .txt 同目錄），tsx 與 dist 皆可解析。
 */
export function loadPrompt(file: string): string {
  const base = readFileSync(join(import.meta.dirname, file), "utf-8");
  if (!config.persona.enabled) return base;
  const persona = readFileSync(join(import.meta.dirname, "persona.txt"), "utf-8");
  return `${persona}\n\n${base}`;
}
