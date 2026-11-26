import { getDemoMessages } from "@/services/mock-data/conversations";
import type { ConversationMessage, SendMessageInput } from "@/types/conversations";

const pause = (duration = 280) => new Promise((resolve) => window.setTimeout(resolve, duration));

/**
 * Local adapter: new messages are always returned as pending demo items.
 * A pending item is never evidence that a message reached another user.
 */
export const messageService = {
  async list(conversationId: string): Promise<ConversationMessage[]> {
    await pause();
    return getDemoMessages(conversationId);
  },

  async send(input: SendMessageInput): Promise<ConversationMessage> {
    await pause(450);
    return {
      id: "demo-" + crypto.randomUUID(),
      conversationId: input.conversationId,
      senderId: "me",
      senderName: "Você",
      kind: input.attachments.length > 0 && !input.text.trim()
        ? attachmentKind(input.attachments[0].mimeType)
        : "text",
      text: input.text.trim(),
      createdAt: new Date().toISOString(),
      delivery: "pending",
      attachments: [...input.attachments],
    };
  },
};

function attachmentKind(mimeType: string): ConversationMessage["kind"] {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}
