"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Avatar } from "@/components/conversations/avatar";
import { ConversationList } from "@/components/conversations/conversation-list";
import { ConversationThread } from "@/components/conversations/conversation-thread";
import { conversationService } from "@/services/conversationService";
import { messageService } from "@/services/messageService";
import type {
  ConversationMessage,
  ConversationSummary,
  MessageAttachment,
  NewConversationInput,
} from "@/types/conversations";

type MobileView = "inbox" | "thread";
type ConversationFilterKind = "direct" | "group";

export function ConversationsWorkspace() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState("");
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, ConversationMessage[]>>({});
  const [listLoading, setListLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [online, setOnline] = useState(true);
  const [mobileView, setMobileView] = useState<MobileView>("inbox");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [conversationKind, setConversationKind] = useState<ConversationFilterKind>("direct");
  const [newName, setNewName] = useState("");
  const [newMembers, setNewMembers] = useState("");
  const [creating, setCreating] = useState(false);
  const [threadRetryKey, setThreadRetryKey] = useState(0);
  const active = useMemo(() => conversations.find((item) => item.id === activeId) ?? null, [activeId, conversations]);
  const threadMessages = active ? messagesByConversation[active.id] ?? [] : [];
  const requestSequence = useRef(0);

  const loadConversations = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const result = await conversationService.list();
      setConversations(result);
      setActiveId((current) => current || result[0]?.id || "");
    } catch {
      setListError("Tente carregar a lista novamente.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const updateConnection = () => setOnline(navigator.onLine);
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    const openDetails = () => setDetailsOpen(true);
    window.addEventListener("connexa:show-details", openDetails);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
      window.removeEventListener("connexa:show-details", openDetails);
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const sequence = ++requestSequence.current;
    setThreadLoading(true);
    setThreadError(null);
    void messageService.list(active.id)
      .then((result) => {
        if (sequence !== requestSequence.current) return;
        setMessagesByConversation((current) => current[active.id] ? current : { ...current, [active.id]: result });
      })
      .catch(() => {
        if (sequence === requestSequence.current) setThreadError("A prévia local não conseguiu abrir este histórico.");
      })
      .finally(() => {
        if (sequence === requestSequence.current) setThreadLoading(false);
      });
  }, [active, threadRetryKey]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function selectConversation(conversation: ConversationSummary) {
    setActiveId(conversation.id);
    setMobileView("thread");
    setConversations((current) => current.map((item) => item.id === conversation.id ? { ...item, unreadCount: 0 } : item));
    try {
      await conversationService.markRead(conversation.id);
    } catch {
      setToast("A conversa foi aberta na prévia, mas a leitura não foi sincronizada.");
    }
  }

  async function sendMessage(text: string, attachments: MessageAttachment[]): Promise<boolean> {
    if (!active) return false;
    setSending(true);
    try {
      const newMessage = await messageService.send({ conversationId: active.id, text, attachments });
      setMessagesByConversation((current) => ({ ...current, [active.id]: [...(current[active.id] ?? []), newMessage] }));
      const preview = text.trim() || attachments.map((item) => item.name).join(", ") || "Anexo";
      setConversations((current) => current.map((item) => item.id === active.id
        ? { ...item, lastMessagePreview: preview, updatedAt: newMessage.createdAt }
        : item));
      setToast(online
        ? "Adicionada à prévia local. Nenhuma mensagem foi enviada."
        : "Você está offline. Esta mensagem existe somente nesta prévia.");
      return true;
    } catch {
      setThreadError("Não foi possível adicionar a mensagem à prévia.");
      return false;
    } finally {
      setSending(false);
    }
  }

  async function createConversation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const input: NewConversationInput = {
      kind: conversationKind,
      name,
      memberNames: conversationKind === "group" ? newMembers.split(",").map((member) => member.trim()).filter(Boolean) : [name],
    };
    setCreating(true);
    try {
      const created = await conversationService.create(input);
      setConversations((current) => [created, ...current]);
      setActiveId(created.id);
      setMessagesByConversation((current) => ({ ...current, [created.id]: [] }));
      setComposerOpen(false);
      setNewName("");
      setNewMembers("");
      setMobileView("thread");
      setToast("Conversa criada somente para a demonstração.");
    } catch {
      setToast("Não foi possível criar a conversa de demonstração.");
    } finally {
      setCreating(false);
    }
  }

  function closeComposer() {
    setComposerOpen(false);
    setNewName("");
    setNewMembers("");
  }

  return (
    <main className="cx-app">
      <aside className="cx-rail" aria-label="Navegação principal">
        <Link href="/" className="cx-brand" aria-label="Connexa, início"><BrandMark compact /></Link>
        <Link href="/conversas" className="cx-rail-link is-selected" aria-current="page" aria-label="Conversas">▤</Link>
        <Link href="/grupos" className="cx-rail-link" aria-label="Grupos">♧</Link>
        <Link href="/colaboradores" className="cx-rail-link" aria-label="Pessoas">♙</Link>
        <Link href="/departamentos" className="cx-rail-link" aria-label="Departamentos">▦</Link>
        <Link href="/arquivos" className="cx-rail-link" aria-label="Arquivos">▥</Link>
        <span className="cx-rail-spacer" />
        <span className="cx-profile-mark" aria-label="Perfil demonstrativo">AC</span>
      </aside>

      <div className="cx-panels">
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          loading={listLoading}
          mobileHidden={mobileView !== "inbox"}
          onSelect={(conversation) => void selectConversation(conversation)}
          onCreate={() => setComposerOpen(true)}
        />
        {listError ? (
          <section className={"cx-thread " + (mobileView === "inbox" ? "cx-mobile-hidden" : "")} aria-label="Conversa selecionada">
            <div className="cx-state-card" role="alert"><span>!</span><strong>Não foi possível carregar as conversas</strong><p>{listError}</p><button type="button" onClick={() => void loadConversations()}>Tentar novamente</button></div>
          </section>
        ) : active ? (
          <div className={"cx-thread-wrap " + (mobileView === "inbox" ? "cx-mobile-hidden" : "")}>
            <ConversationThread
              conversation={active}
              messages={threadMessages}
              loading={threadLoading}
              sending={sending}
              online={online}
              error={threadError}
              onBack={() => setMobileView("inbox")}
              onSend={sendMessage}
              onRetry={() => {
                setThreadError(null);
                setMessagesByConversation((current) => {
                  const next = { ...current };
                  delete next[active.id];
                  return next;
                });
                setThreadRetryKey((current) => current + 1);
              }}
            />
          </div>
        ) : (
          <section className={"cx-thread cx-no-conversation " + (mobileView === "inbox" ? "cx-mobile-hidden" : "")}>
            <div className="cx-state-card"><span>✳</span><strong>Suas conversas começam aqui</strong><p>Escolha uma conversa ou inicie uma nova demonstração.</p><button type="button" onClick={() => setComposerOpen(true)}>Nova conversa</button></div>
          </section>
        )}
        {detailsOpen && active && (
          <aside className="cx-details" aria-label="Detalhes da conversa">
            <div className="cx-details-heading"><strong>Detalhes</strong><button type="button" onClick={() => setDetailsOpen(false)} aria-label="Fechar detalhes">×</button></div>
            <div className="cx-profile-card"><Avatar initials={active.initials} tone={active.avatarTone} size="large" online={active.online} /><h2>{active.name}</h2><p>{active.subtitle}</p><span>{active.kind === "group" ? "Conversa em grupo" : "Conversa individual"}</span></div>
            <div className="cx-details-section"><span className="cx-details-label">PARTICIPANTES</span>{active.memberNames.map((member) => <div className="cx-member-row" key={member}><span>{memberInitials(member)}</span><strong>{member}</strong></div>)}</div>
            <div className="cx-details-section"><span className="cx-details-label">ANEXOS NESTA PRÉVIA</span><p>Arquivos selecionados ficam somente no seu navegador e não foram enviados.</p></div>
            <div className="cx-details-section"><span className="cx-details-label">ACESSO</span><p>O protótipo não consulta nem concede permissões. As operações reais dependerão de autorização do servidor.</p></div>
          </aside>
        )}
      </div>

      <nav className="cx-mobile-nav" aria-label="Navegação mobile">
        <Link href="/conversas" className="is-selected" aria-current="page"><span>▤</span><small>Conversas</small></Link>
        <Link href="/grupos"><span>♧</span><small>Grupos</small></Link>
        <Link href="/colaboradores"><span>♙</span><small>Pessoas</small></Link>
        <Link href="/departamentos"><span>▦</span><small>Setores</small></Link>
        <Link href="/arquivos"><span>▥</span><small>Arquivos</small></Link>
      </nav>

      {!online && <div className="cx-global-offline" role="status">Sem conexão <span>· prévia local disponível</span></div>}
      {toast && <div className="cx-toast" role="status">{toast}</div>}
      {composerOpen && (
        <div className="cx-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeComposer(); }}>
          <form className="cx-modal" onSubmit={(event) => void createConversation(event)} onKeyDown={(event) => { if (event.key === "Escape") closeComposer(); }} role="dialog" aria-modal="true" aria-labelledby="cx-new-conversation-title">
            <div className="cx-modal-heading"><div><p className="cx-eyebrow">PRÉVIA LOCAL</p><h2 id="cx-new-conversation-title">Nova conversa</h2></div><button type="button" onClick={closeComposer} aria-label="Fechar">×</button></div>
            <label className="cx-form-field">Tipo de conversa<select value={conversationKind} onChange={(event) => setConversationKind(event.target.value as ConversationFilterKind)}><option value="direct">Individual</option><option value="group">Grupo</option></select></label>
            <label className="cx-form-field">{conversationKind === "group" ? "Nome do grupo" : "Nome do colaborador"}<input autoFocus required value={newName} onChange={(event) => setNewName(event.target.value)} placeholder={conversationKind === "group" ? "Ex.: Projeto Horizonte" : "Ex.: Ana Costa"} /></label>
            {conversationKind === "group" && <label className="cx-form-field">Participantes demonstrativos<input value={newMembers} onChange={(event) => setNewMembers(event.target.value)} placeholder="Separe nomes por vírgula" /><small>Os nomes não são consultados no diretório.</small></label>}
            <p className="cx-modal-note">Criar aqui não cria uma conversa real no servidor.</p>
            <div className="cx-modal-actions"><button type="button" className="cx-secondary-button" onClick={closeComposer}>Cancelar</button><button type="submit" className="cx-primary-button" disabled={creating}>{creating ? "Preparando…" : "Criar prévia"}</button></div>
          </form>
        </div>
      )}
    </main>
  );
}

function memberInitials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}
