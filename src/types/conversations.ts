export type ConversationKind = "direct" | "group";
export type MessageKind = "text" | "image" | "document" | "audio" | "system";
export type MessageDelivery = "sent" | "pending" | "failed";

export type ConversationSummary = {
  id: string;
  kind: ConversationKind;
  name: string;
  subtitle: string;
  initials: string;
  avatarTone: "plum" | "coral" | "blue" | "mint" | "gold";
  updatedAt: string;
  lastMessagePreview: string;
  unreadCount: number;
  online?: boolean;
  memberNames: string[];
};

export type MessageAttachment = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  localPreviewUrl?: string;
};

export type ConversationMessage = {
  id: string;
  conversationId: string;
  senderId: "me" | string;
  senderName: string;
  kind: MessageKind;
  text: string;
  createdAt: string;
  delivery: MessageDelivery;
  attachments: MessageAttachment[];
};

export type NewConversationInput = {
  kind: ConversationKind;
  name: string;
  memberNames: string[];
};

export type SendMessageInput = {
  conversationId: string;
  text: string;
  attachments: MessageAttachment[];
};
