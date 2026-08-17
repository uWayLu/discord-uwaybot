import type { Message } from "discord.js";

export function getImageAttachmentUrl(message: Message): string | null {
  const att = message.attachments.find((a) => a.contentType?.startsWith("image/"));
  return att?.url ?? null;
}