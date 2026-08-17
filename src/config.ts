import "dotenv/config";

function required(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(`Missing required env variable: ${key}`);
  }
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

function optionalInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (!val) return fallback;
  const parsed = parseInt(val, 10);
  if (isNaN(parsed)) throw new Error(`Invalid int for ${key}: ${val}`);
  return parsed;
}

export const config = {
  discord: {
    token: required("DISCORD_TOKEN"),
    clientId: required("DISCORD_CLIENT_ID"),
    guildId: process.env["DISCORD_GUILD_ID"] || undefined,
  },
  openai: {
    apiKey: required("OPENAI_API_KEY"),
    baseUrl: optional("OPENAI_BASE_URL", "https://gemini.uwaylu.net/v1"),
    model: optional("OPENAI_MODEL", "gemini-3-flash"),
  },
  modelRoles: {
    core: optional("MODEL_CORE", "big-pickle"),
    light: optional("MODEL_LIGHT", "deepseek-v4-flash-free"),
  },
  summary: {
    maxHours: optionalInt("SUMMARY_MAX_HOURS", 336),
    topicGapMinutes: optionalInt("SUMMARY_TOP_MINUTES", 10),
  },
  directed: {
    cooldownChannelMs: optionalInt("DIRECTED_COOLDOWN_CHANNEL_MS", 5_000),
    cooldownUserMs: optionalInt("DIRECTED_COOLDOWN_USER_MS", 5_000),
    thresholdHigh: optionalInt("DIRECTED_THRESHOLD_HIGH", 3),
    thresholdMid: optionalInt("DIRECTED_THRESHOLD_MID", 0),
    pHigh: optionalInt("DIRECTED_PROB_HIGH", 95) / 100,
    pMid: optionalInt("DIRECTED_PROB_MID", 40) / 100,
    pLow: optionalInt("DIRECTED_PROB_LOW", 12) / 100,
  },
  gif: {
    enabled: optionalInt("GIF_ENABLED", 1) === 1,
    probability: optionalInt("GIF_PROB", 20) / 100,
    contest: optional("MEMES_CONTEST", ""),
  },
  chatSession: {
    idleMs: optionalInt("CHAT_SESSION_IDLE_MIN", 30) * 60_000,
    maxTurns: optionalInt("CHAT_SESSION_MAX_TURNS", 20),
    maxChars: optionalInt("CHAT_SESSION_MAX_CHARS", 8000),
  },
  searchCount: {
    defaultDays: optionalInt("SEARCH_COUNT_DEFAULT_DAYS", 30),
  },
  persona: {
    enabled: optionalInt("PERSONA_ENABLED", 1) === 1,
  },
  rag: {
    enabled: optionalInt("RAG_ENABLED", 1) === 1,
    topK: optionalInt("RAG_TOP_K", 6),
    rangeDays: optionalInt("RAG_RANGE_DAYS", 0),
    minQueryChars: optionalInt("RAG_MIN_QUERY_CHARS", 2),
    bm25Threshold: optionalInt("RAG_BM25_THRESHOLD", 0),
  },
  ocr: {
    enabled: optionalInt("OCR_ENABLED", 1) === 1,
  },
} as const;
