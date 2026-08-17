import { llm } from "./client.js";
import { getActiveModel } from "./model-router.js";

const SYSTEM = `你是 GIF 搜尋關鍵字轉換器。使用者給一個「迷因／梗」的關鍵字或句子，請回傳一個**最可能在英文 GIF 站（Tenor／Giphy）找到該梗 GIF 的英文或羅馬拼音關鍵字**。

規則：
- 日文／漢字／中文梗 → 轉成羅馬拼音或英文迷因名。例如：「五條悟」→「gojo satoru」、「會贏喔」→「gojo wins」、「天元突破」→「gurren lagann」。
- 已是英文 → 保留或精簡成慣用迷因名。
- 回傳格式：只回傳一個 JSON 字串，例如 {"keyword":"gojo satoru"}
- 若無法轉成有意義的英文關鍵字（例如是無意義的符號、數字），回傳 {"keyword":""}`;

export async function gifKeyword(query: string): Promise<string> {
  const q = query.trim();
  if (!q) return "";
  try {
    const response = await llm.chat.completions.create({
      model: getActiveModel(),
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: q },
      ],
      max_tokens: 60,
    });
    const content = response.choices[0]?.message?.content ?? "";
    const jsonStr = content
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();
    const m = jsonStr.match(/\{"keyword":"([^"]*)"\}/);
    const keyword = m ? m[1] ?? "" : jsonStr.replace(/[^a-zA-Z0-9\s]/g, "").trim();
    return keyword.trim();
  } catch (e) {
    console.error("[GIF] gifKeyword error:", (e as Error).message);
    return "";
  }
}
