import type { ConversationMessage, ConversationSummary } from "@/types/conversations";

const today = new Date();
const atTime = (hours: number, minutes: number) => {
  const date = new Date(today);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
};

export const demoConversations: ConversationSummary[] = [
  {
    id: "conv-tech", kind: "group", name: "Equipe de Tecnologia",
    subtitle: "Departamento de TI · 8 participantes", initials: "TI",
    avatarTone: "plum", updatedAt: atTime(9, 42),
    lastMessagePreview: "A manutenção foi concluída. Obrigado!",
    unreadCount: 2, memberNames: ["Ana Costa", "Caio Lima", "Joana Alves", "Lucas Freitas"],
  },
  {
    id: "conv-ana", kind: "direct", name: "Ana Costa",
    subtitle: "Departamento de Pessoas", initials: "AC", avatarTone: "coral",
    updatedAt: atTime(9, 28), lastMessagePreview: "Pode revisar o comunicado antes do envio?",
    unreadCount: 0, online: true, memberNames: ["Ana Costa", "Você"],
  },
  {
    id: "conv-north", kind: "group", name: "Operações · Unidade Norte",
    subtitle: "Departamento de Operações · 14 participantes", initials: "ON",
    avatarTone: "blue", updatedAt: atTime(8, 5),
    lastMessagePreview: "Escala atualizada na pasta compartilhada.",
    unreadCount: 0, memberNames: ["Rafael Nunes", "Bianca Melo", "Você"],
  },
  {
    id: "conv-carlos", kind: "direct", name: "Carlos Mendes",
    subtitle: "Departamento Financeiro", initials: "CM", avatarTone: "mint",
    updatedAt: atTime(7, 50), lastMessagePreview: "Documento recebido, obrigado!",
    unreadCount: 0, online: false, memberNames: ["Carlos Mendes", "Você"],
  },
  {
    id: "conv-project", kind: "group", name: "Projeto Horizonte",
    subtitle: "Grupo · 5 participantes", initials: "PH", avatarTone: "gold",
    updatedAt: atTime(7, 20), lastMessagePreview: "Enviei a pauta para nossa reunião.",
    unreadCount: 5, memberNames: ["Marina Souza", "Pedro Rocha", "Lia Castro", "Você"],
  },
];

const conversationMessages: Record<string, ConversationMessage[]> = {
  "conv-tech": [
    { id: "tech-1", conversationId: "conv-tech", senderId: "Caio", senderName: "Caio Lima", kind: "text", text: "Pessoal, a janela de manutenção do portal começa às 9h.", createdAt: atTime(9, 15), delivery: "sent", attachments: [] },
    { id: "tech-2", conversationId: "conv-tech", senderId: "me", senderName: "Você", kind: "text", text: "Recebido. Vou acompanhar os testes de acesso.", createdAt: atTime(9, 20), delivery: "sent", attachments: [] },
    { id: "tech-3", conversationId: "conv-tech", senderId: "Joana", senderName: "Joana Alves", kind: "text", text: "A manutenção foi concluída. Obrigado!", createdAt: atTime(9, 42), delivery: "sent", attachments: [] },
  ],
  "conv-ana": [
    { id: "ana-1", conversationId: "conv-ana", senderId: "Ana", senderName: "Ana Costa", kind: "text", text: "Bom dia! Atualizamos o comunicado de integração dos novos colaboradores.", createdAt: atTime(9, 18), delivery: "sent", attachments: [] },
    { id: "ana-2", conversationId: "conv-ana", senderId: "me", senderName: "Você", kind: "text", text: "Perfeito. Vou revisar e retorno ainda nesta manhã.", createdAt: atTime(9, 20), delivery: "sent", attachments: [] },
    { id: "ana-3", conversationId: "conv-ana", senderId: "Ana", senderName: "Ana Costa", kind: "text", text: "Pode revisar o comunicado antes do envio?", createdAt: atTime(9, 28), delivery: "sent", attachments: [] },
  ],
  "conv-north": [
    { id: "north-1", conversationId: "conv-north", senderId: "Rafael", senderName: "Rafael Nunes", kind: "text", text: "A equipe da unidade Norte confirmou a escala da próxima semana.", createdAt: atTime(8, 0), delivery: "sent", attachments: [] },
    { id: "north-2", conversationId: "conv-north", senderId: "me", senderName: "Você", kind: "text", text: "Obrigado! Vou compartilhar com os responsáveis.", createdAt: atTime(8, 2), delivery: "sent", attachments: [] },
    { id: "north-3", conversationId: "conv-north", senderId: "Bianca", senderName: "Bianca Melo", kind: "text", text: "Escala atualizada na pasta compartilhada.", createdAt: atTime(8, 5), delivery: "sent", attachments: [] },
  ],
  "conv-carlos": [
    { id: "carlos-1", conversationId: "conv-carlos", senderId: "Carlos", senderName: "Carlos Mendes", kind: "text", text: "Estou encaminhando o relatório solicitado.", createdAt: atTime(7, 44), delivery: "sent", attachments: [] },
    { id: "carlos-2", conversationId: "conv-carlos", senderId: "me", senderName: "Você", kind: "text", text: "Recebido. Obrigado pelo envio.", createdAt: atTime(7, 46), delivery: "sent", attachments: [] },
    { id: "carlos-3", conversationId: "conv-carlos", senderId: "Carlos", senderName: "Carlos Mendes", kind: "text", text: "Documento recebido, obrigado.", createdAt: atTime(7, 50), delivery: "sent", attachments: [] },
  ],
  "conv-project": [
    { id: "project-1", conversationId: "conv-project", senderId: "Marina", senderName: "Marina Souza", kind: "text", text: "Compartilhando a pauta da reunião de hoje.", createdAt: atTime(7, 12), delivery: "sent", attachments: [] },
    { id: "project-2", conversationId: "conv-project", senderId: "Pedro", senderName: "Pedro Rocha", kind: "text", text: "Ótimo, vou revisar os pontos do cronograma.", createdAt: atTime(7, 15), delivery: "sent", attachments: [] },
    { id: "project-3", conversationId: "conv-project", senderId: "Marina", senderName: "Marina Souza", kind: "text", text: "Enviei a pauta para nossa reunião.", createdAt: atTime(7, 20), delivery: "sent", attachments: [] },
  ],
};

export function getDemoMessages(conversationId: string) {
  return (conversationMessages[conversationId] ?? []).map((message) => ({ ...message, attachments: [...message.attachments] }));
}
