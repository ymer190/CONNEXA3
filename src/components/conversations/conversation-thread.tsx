"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/conversations/avatar";
import { AttachmentCard } from "@/components/conversations/attachment-card";
import { attachmentService } from "@/services/attachmentService";
import type { ConversationMessage, ConversationSummary, MessageAttachment } from "@/types/conversations";

type ConversationThreadProps = {
  conversation: ConversationSummary;
  messages: ConversationMessage[];
  loading: boolean;
  sending: boolean;
  online: boolean;
  error: string | null;
  onBack: () => void;
  onSend: (text: string, attachments: MessageAttachment[]) => Promise<boolean>;
  onRetry: () => void;
};

const maxFileSize: Record<string, number> = {
  image: 15 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  document: 50 * 1024 * 1024,
};

export function ConversationThread({ conversation, messages, loading, sending, online, error, onBack, onSend, onRetry }: ConversationThreadProps) {
  const [text, setText] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [messageSearch, setMessageSearch] = useState("");
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const previewUrls = useRef(new Set<string>());
  const filteredMessages = useMemo(() => {
    if (!messageSearch.trim()) return messages;
    const query = messageSearch.toLocaleLowerCase("pt-BR");
    return messages.filter((message) => message.text.toLocaleLowerCase("pt-BR").includes(query)
      || message.attachments.some((attachment) => attachment.name.toLocaleLowerCase("pt-BR").includes(query)));
  }, [messageSearch, messages]);

  useEffect(() => () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current.clear();
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim() && attachments.length === 0) return;
    const sentToPreview = await onSend(text, attachments);
    if (sentToPreview) {
      setText("");
      setAttachments([]);
    }
  }

  function chooseFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    const invalid = selected.find((file) => {
      const category = categoryFor(file.type);
      return !category || file.size > maxFileSize[category];
    });
    if (invalid) {
      setAttachmentError("Esse formato não é aceito ou excede o limite definido para o tipo de arquivo.");
      event.target.value = "";
      return;
    }
    setAttachmentError("");
    const prepared = attachmentService.prepare(selected);
    prepared.forEach((attachment) => {
      if (attachment.localPreviewUrl) previewUrls.current.add(attachment.localPreviewUrl);
    });
    setAttachments((current) => [...current, ...prepared]);
    event.target.value = "";
  }

  function removeAttachment(attachment: MessageAttachment) {
    if (attachment.localPreviewUrl) {
      URL.revokeObjectURL(attachment.localPreviewUrl);
      previewUrls.current.delete(attachment.localPreviewUrl);
    }
    setAttachments((current) => current.filter((item) => item.id !== attachment.id));
  }

  return (
    <section className="cx-thread" aria-label={conversation.kind === "group" ? "Conversa em grupo" : "Conversa individual"}>
      <header className="cx-thread-header">
        <button className="cx-back-button" type="button" onClick={onBack} aria-label="Voltar para a lista">←</button>
        <Avatar initials={conversation.initials} tone={conversation.avatarTone} size="small" online={conversation.online} />
        <div className="cx-thread-person">
          <strong>{conversation.name}</strong>
          <span>{conversation.kind === "group" ? conversation.subtitle : conversation.online ? "Online agora" : conversation.subtitle}</span>
        </div>
        <button className="cx-header-action" type="button" aria-label="Pesquisar nesta conversa" onClick={() => setSearchOpen((open) => !open)}>⌕</button>
        <button className="cx-header-action" type="button" aria-label="Detalhes da conversa" onClick={() => window.dispatchEvent(new CustomEvent("connexa:show-details"))}>ⓘ</button>
        <button className="cx-header-action" type="button" aria-label="Mais opções da conversa" onClick={() => window.dispatchEvent(new CustomEvent("connexa:show-details"))}>···</button>
      </header>

      {searchOpen && <label className="cx-message-search"><span aria-hidden="true">⌕</span><input value={messageSearch} onChange={(event) => setMessageSearch(event.target.value)} placeholder="Buscar nesta conversa" aria-label="Buscar mensagens nesta conversa" autoFocus /><button type="button" onClick={() => { setMessageSearch(""); setSearchOpen(false); }} aria-label="Fechar busca">×</button></label>}
      {!online && <div className="cx-offline-banner" role="status"><span>Você está sem conexão. Mensagens ficam apenas na demonstração local.</span></div>}
      <div className="cx-demo-banner"><span aria-hidden="true">ⓘ</span><span>Prévia local. Mensagens e arquivos não são enviados nem salvos no servidor.</span></div>

      <div className="cx-thread-scroll" role="log" aria-label={"Histórico de demonstração com " + conversation.name} aria-live="polite" aria-relevant="additions text">
        <div className="cx-date-divider"><span>HOJE</span></div>
        {loading ? <div className="cx-thread-loading"><i /><i /><i /></div> : error ? (
          <div className="cx-state-card" role="alert"><span>!</span><strong>Não foi possível abrir as mensagens</strong><p>{error}</p><button type="button" onClick={onRetry}>Tentar novamente</button></div>
        ) : filteredMessages.length === 0 ? (
          <div className="cx-thread-empty"><strong>{messageSearch ? "Nenhuma mensagem encontrada" : "Esta conversa está começando"}</strong><span>{messageSearch ? "Tente outro termo." : "Envie uma mensagem de demonstração para continuar."}</span></div>
        ) : filteredMessages.map((message) => (
          <article key={message.id} className={message.senderId === "me" ? "cx-message cx-message-outgoing" : "cx-message cx-message-incoming"}>
            {conversation.kind === "group" && message.senderId !== "me" && <span className="cx-message-sender">{message.senderName}</span>}
            <div className="cx-bubble">
              {message.text && <p>{message.text}</p>}
              {message.attachments.map((attachment) => <AttachmentCard attachment={attachment} key={attachment.id} />)}
              <footer><time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>{message.senderId === "me" && <span className={"cx-delivery cx-delivery-" + message.delivery}>{deliveryText(message.delivery)}</span>}</footer>
            </div>
          </article>
        ))}
      </div>

      <form className="cx-composer-wrap" onSubmit={submit}>
        {attachmentError && <p className="cx-attachment-error" role="alert">{attachmentError}</p>}
        {attachments.length > 0 && <div className="cx-attachment-staging" aria-label="Anexos locais selecionados">
          {attachments.map((attachment) => <div className="cx-staged-file" key={attachment.id}>
            <span>{attachment.mimeType.startsWith("image/") ? "▧" : attachment.mimeType.startsWith("audio/") ? "♫" : "▤"}</span><strong>{attachment.name}</strong>
            <button type="button" onClick={() => removeAttachment(attachment)} aria-label={"Remover " + attachment.name}>×</button>
          </div>)}
        </div>}
        <div className="cx-composer">
          <label className="cx-tool-button" aria-label="Anexar imagem, documento ou áudio" title="Anexar imagem, documento ou áudio">
            <input type="file" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" multiple onChange={chooseFiles} />
            <span aria-hidden="true">＋</span>
          </label>
          <textarea rows={1} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Escreva uma mensagem…" aria-label="Escreva uma mensagem" />
          <button type="submit" className="cx-send-button" disabled={sending || (!text.trim() && attachments.length === 0)} aria-label={sending ? "Preparando mensagem" : "Adicionar mensagem à demonstração"}>{sending ? <span className="cx-spinner" /> : "↑"}</button>
        </div>
        <div className="cx-composer-foot"><span>Enter adiciona à prévia · Shift + Enter quebra a linha</span><span>Envio real indisponível</span></div>
      </form>
    </section>
  );
}

function categoryFor(mimeType: string) {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (/^(application\/pdf|application\/(msword|vnd\.|vnd\.openxmlformats)|text\/plain)/.test(mimeType)) return "document";
  return null;
}

function formatMessageTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function deliveryText(delivery: ConversationMessage["delivery"]) {
  if (delivery === "pending") return "· somente nesta prévia";
  if (delivery === "failed") return "· não enviado";
  return "· demonstração";
}
