import { config } from "../config.js";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface ChannelSession {
  turns: ChatTurn[];
  lastActivity: number;
}

const sessions = new Map<string, ChannelSession>();

const SWEEP_INTERVAL_MS = 10 * 60_000;
const SWEEP_IDLE_MS = 2 * 60 * 60_000;

function pruneTurns(turns: ChatTurn[]): ChatTurn[] {
  const { maxTurns, maxChars } = config.chatSession;
  let pruned = turns;
  if (pruned.length > maxTurns) {
    pruned = pruned.slice(-maxTurns);
  }
  let total = pruned.reduce((sum, t) => sum + t.content.length, 0);
  let i = 0;
  while (total > maxChars && pruned.length > 1) {
    const removed = pruned[i]?.content.length ?? 0;
    pruned = pruned.slice(1);
    total -= removed;
  }
  return pruned;
}

export function resetIfIdle(channelId: string, now: number = Date.now()): void {
  const s = sessions.get(channelId);
  if (s && now - s.lastActivity > config.chatSession.idleMs) {
    sessions.delete(channelId);
  }
}

export function getTurns(channelId: string): ChatTurn[] {
  const s = sessions.get(channelId);
  return s ? s.turns : [];
}

export function appendUser(channelId: string, text: string): void {
  const content = text.trim();
  if (!content) return;
  const now = Date.now();
  const existing = sessions.get(channelId);
  const turns = existing ? existing.turns : [];
  turns.push({ role: "user", content });
  sessions.set(channelId, { turns: pruneTurns(turns), lastActivity: now });
}

export function appendBot(channelId: string, contents: string[]): void {
  const parts = contents.map((c) => c?.trim()).filter((c) => c && c.length > 0);
  if (parts.length === 0) return;
  const now = Date.now();
  const existing = sessions.get(channelId);
  const turns = existing ? existing.turns : [];
  for (const c of parts) turns.push({ role: "assistant", content: c });
  sessions.set(channelId, { turns: pruneTurns(turns), lastActivity: now });
}

export const MENTION_STRIP_RE = /<@!?\d+>/g;

let sweepStarted = false;
export function startSessionSweep(): void {
  if (sweepStarted) return;
  sweepStarted = true;
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions) {
      if (now - s.lastActivity > SWEEP_IDLE_MS) sessions.delete(id);
    }
  }, SWEEP_INTERVAL_MS);
  timer.unref?.();
}

// 測試用
export function _clearSessionsForTest(): void {
  sessions.clear();
}