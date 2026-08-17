import { llm } from "./client.js";
import { config } from "../config.js";

export interface MemeCandidate {
  id: number;
  title: string;
  hashtag: string;
  src: string;
  contest: string;
}

const SYSTEM = `你是「梗圖選圖器」。使用者給一個「想要的表情／語意／話題」（例如「笑死」、「無奈」、「股市大跌」），並附上一批候選梗圖（含編號、標題、標籤、分類）。請挑出**語意最符合**的一張，回傳其編號。

規則：
- 挑選原則：與需求語意最貼近的那張；寧可明確不符就回 null，不要硬選。
- 只回傳一個 JSON 字串，格式：{"best": <編號>} 或 {"best": null}
- 若候選清單為空或都不相符，回 {"best": null}`;

export interface MemeCandidateInput {
  id: number;
  title: string;
  hashtag: string;
  contest: string;
}

/**
 * 依 query 語意在候選梗圖中挑一張最貼近的，回傳其 src；無符合或失敗回 null。
 */
export async function selectMeme(
  query: string,
  candidates: MemeCandidateInput[],
  srcById: Map<number, string>,
): Promise<string | null> {
  const q = query.trim();
  if (!q || candidates.length === 0) return null;

  const list = candidates
    .map(
      (c, i) =>
        `${i}. 標題: ${c.title} ｜ 標籤: ${c.hashtag} ｜ 分類: ${c.contest}`,
    )
    .join("\n");

  try {
    const response = await llm.chat.completions.create({
      model: config.openai.model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `想要: ${q}\n\n候選梗圖:\n${list}` },
      ],
      max_tokens: 40,
    });
    const content = response.choices[0]?.message?.content ?? "";
    const jsonStr = content
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();
    const m = jsonStr.match(/\{"best"\s*:\s*(\d+)\}/);
    if (!m) return null;
    const idx = Number(m[1]);
    if (Number.isNaN(idx) || idx < 0 || idx >= candidates.length) return null;
    const chosen = candidates[idx];
    if (!chosen) return null;
    return srcById.get(chosen.id) ?? null;
  } catch (error) {
    console.error("[GIF] selectMeme error:", (error as Error).message);
    return null;
  }
}
