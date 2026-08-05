import type { StoredMessage } from "./message-store.js";

function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  const clean = text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, " ");
  for (const word of clean.split(/\s+/)) {
    if (!word) continue;
    if (word.length === 1) {
      tokens.add(word);
      continue;
    }
    if (/[\u3400-\u9fff]/u.test(word)) {
      tokens.add(word);
      for (let i = 0; i < word.length - 1; i++) {
        tokens.add(word.slice(i, i + 2));
      }
    } else {
      tokens.add(word);
    }
  }
  return tokens;
}

export function retrieveExamples(
  userMessages: StoredMessage[],
  contextMessages: StoredMessage[],
  limit: number = 10,
): StoredMessage[] {
  const candidates = userMessages.filter((m) => m.content.trim().length > 1);
  if (candidates.length === 0) return [];

  const contextTokens = new Set<string>();
  for (const m of contextMessages) {
    for (const t of tokenize(m.content)) contextTokens.add(t);
  }

  const scored = candidates
    .map((m) => {
      const tokens = tokenize(m.content);
      let overlap = 0;
      for (const t of tokens) {
        if (contextTokens.has(t)) overlap++;
      }
      const score =
        overlap / Math.max(1, Math.sqrt(tokens.size)) + overlap * 0.01;
      return { m, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const matched = scored.slice(0, limit).map((s) => s.m);
  if (matched.length >= limit) return matched;

  const matchedIds = new Set(matched.map((m) => m.id));
  const recent = candidates
    .slice(-limit)
    .filter((m) => !matchedIds.has(m.id))
    .slice(0, limit - matched.length);

  return [...matched, ...recent];
}
