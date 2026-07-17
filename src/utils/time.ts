const DURATION_RE = /^(\d+)(m|h|d)$/;

export function parseDuration(input: string): { ms: number; label: string } | null {
  const match = DURATION_RE.exec(input.trim().toLowerCase());
  if (!match) return null;

  const value = parseInt(match[1]!, 10);
  const unit = match[2];

  switch (unit) {
    case "m":
      return { ms: value * 60 * 1000, label: `${value} 分鐘` };
    case "h":
      return { ms: value * 60 * 60 * 1000, label: `${value} 小時` };
    case "d":
      return { ms: value * 24 * 60 * 60 * 1000, label: `${value} 天` };
    default:
      return null;
  }
}

export function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
}
