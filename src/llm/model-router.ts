import { config } from "../config.js";

export type ModelRole = "core" | "light";

/**
 * 依任務類型取得對應模型：
 * - core（整合／長上下文）：chat、opinion、profile、simulate、summary
 * - light（小任務／分類／拆分）：reference、search、gif-keyword、meme-select
 */
export function getModel(role: ModelRole): string {
  return config.modelRoles[role] ?? config.modelRoles.core;
}
