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
  summary: {
    maxHours: optionalInt("SUMMARY_MAX_HOURS", 336),
    topicGapMinutes: optionalInt("SUMMARY_TOP_MINUTES", 10),
  },
} as const;
