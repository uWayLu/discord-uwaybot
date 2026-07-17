const DURATION_RE = /^([+-]?)(\d+)(m|h|d)$/;

export function parseDuration(input: string): { ms: number; label: string } | null {
  const match = DURATION_RE.exec(input.trim().toLowerCase());
  if (!match) return null;

  const sign = match[1] === "-" ? -1 : 1;
  const value = parseInt(match[2]!, 10);
  const unit = match[3];

  let ms: number;
  let label: string;
  switch (unit) {
    case "m":
      ms = value * 60 * 1000;
      label = `${value} 分鐘`;
      break;
    case "h":
      ms = value * 60 * 60 * 1000;
      label = `${value} 小時`;
      break;
    case "d":
      ms = value * 24 * 60 * 60 * 1000;
      label = `${value} 天`;
      break;
    default:
      return null;
  }

  return { ms, label };
}

export function parseOptionalDate(input: string | null): Date | null {
  if (!input) return null;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

export function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
}
