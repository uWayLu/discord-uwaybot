export type ChatMode = "short" | "medium";

const OPINION_RE =
  /(?:https?:\/\/\S+)|分析|你怎麼看|怎麼看|怎麼評價|比較|比較一下|評價|評估|對[\s\S]{1,20}的看法|看法|觀點/;

// 太 casual 的「你覺得呢」不觸發中等長度
const CASUAL_STRIP_RE =
  /(?:你覺得呢|你覺得|那你覺得|你們覺得|大家覺得|怎麼回事|怎麼辦)/;

const ESCALATE_RE =
  /詳細(?!\s*一點就夠|一下就好)(?:點|講|說明|說|化)?|深入|展開|講多(?:點|一些|)?|多說(?:點|一些|)?|說詳細|講詳細|再詳細/;

export function detectChatMode(text: string): ChatMode {
  if (ESCALATE_RE.test(text)) return "medium";
  const stripped = text.replace(CASUAL_STRIP_RE, "");
  if (OPINION_RE.test(stripped)) return "medium";
  return "short";
}