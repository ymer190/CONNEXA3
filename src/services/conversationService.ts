import { demoConversations } from "@/services/mock-data/conversations";
import type { ConversationSummary, NewConversationInput } from "@/types/conversations";

const pause = (duration = 320) => new Promise((resolve) => window.setTimeout(resolve, duration));

/**
 * Local adapter for the conversation inbox.
 * Replace this implementation with the approved server operation when it exists.
 * Do not query Supabase tables directly from this service.
 */
export const conversationService = {
  async list(): Promise<ConversationSummary[]> {
    await pause();
    return demoConversations.map((conversation) => ({ ...conversation, memberNames: [...conversation.memberNames] }));
  },

  async markRead(conversationId: string): Promise<void> {
    await pause(80);
    void conversationId;
  },

  async create(input: NewConversationInput): Promise<ConversationSummary> {
    await pause(180);
    const name = input.name.trim();
    const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    return {
      id: "demo-" + crypto.randomUUID(),
      kind: input.kind,
      name,
      subtitle: input.kind === "group" ? "Grupo · " + (input.memberNames.length + 1) + " participantes" : "Colaborador",
      initials,
      avatarTone: "gold",
      updatedAt: new Date().toISOString(),
      lastMessagePreview: "Conversa iniciada. Envie a primeira mensagem.",
      unreadCount: 0,
      memberNames: [...input.memberNames, "Você"],
    };
  },
};
