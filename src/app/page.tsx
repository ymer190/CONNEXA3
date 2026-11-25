"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { BrandMark } from "@/components/brand-mark";

type Message = { id: number; from: "them" | "me"; text: string; time: string; status?: string };
type Conversation = {
  id: number;
  name: string;
  company: string;
  initials: string;
  color: string;
  preview: string;
  time: string;
  unread: number;
  channel: "Direta" | "Grupo";
  label: string;
  online?: boolean;
  messages: Message[];
};

const initialConversations: Conversation[] = [
  { id: 1, name: "Equipe de Tecnologia", company: "Departamento de TI · 8 participantes", initials: "TI", color: "lilac", preview: "A manutenção foi concluída. Obrigado!", time: "09:42", unread: 2, channel: "Grupo", label: "Tecnologia", messages: [
    { id: 1, from: "them", text: "Pessoal, a janela de manutenção do portal começa às 9h.", time: "09:15" },
    { id: 2, from: "me", text: "Recebido. Vou acompanhar os testes de acesso.", time: "09:20", status: "Enviada" },
    { id: 3, from: "them", text: "A manutenção foi concluída. Obrigado!", time: "09:42" },
  ] },
  { id: 2, name: "Ana Costa", company: "Departamento de Pessoas", initials: "AC", color: "peach", preview: "Pode revisar o comunicado antes do envio?", time: "09:28", unread: 0, channel: "Direta", label: "Pessoas", messages: [
    { id: 1, from: "them", text: "Bom dia! Atualizamos o comunicado de integração dos novos colaboradores.", time: "09:18" },
    { id: 2, from: "me", text: "Perfeito. Vou revisar e retorno ainda nesta manhã.", time: "09:20", status: "Enviada" },
    { id: 3, from: "them", text: "Pode revisar o comunicado antes do envio?", time: "09:28" },
  ] },
  { id: 3, name: "Operações · Unidade Norte", company: "Departamento de Operações · 14 participantes", initials: "OP", color: "blue", preview: "Escala atualizada na pasta compartilhada.", time: "Ontem", unread: 0, channel: "Grupo", label: "Operações", messages: [
    { id: 1, from: "them", text: "A equipe da unidade Norte confirmou a escala da próxima semana.", time: "16:10" },
    { id: 2, from: "me", text: "Obrigado! Vou compartilhar com os responsáveis.", time: "16:15", status: "Enviada" },
    { id: 3, from: "them", text: "Escala atualizada na pasta compartilhada.", time: "16:20" },
  ] },
  { id: 4, name: "Carlos Mendes", company: "Departamento Financeiro", initials: "CM", color: "mint", preview: "Documento recebido, obrigado.", time: "Ontem", unread: 0, channel: "Direta", label: "Financeiro", messages: [
    { id: 1, from: "them", text: "Estou encaminhando o relatório solicitado.", time: "14:02" },
    { id: 2, from: "me", text: "Recebido. Obrigado pelo envio.", time: "14:10", status: "Enviada" },
    { id: 3, from: "them", text: "Documento recebido, obrigado.", time: "14:16" },
  ] },
];

export default function Home() {
  const [conversations, setConversations] = useState(initialConversations);
  const [activeId, setActiveId] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Todas");
  const [message, setMessage] = useState("");
  const [showContact, setShowContact] = useState(false);
  const [toast, setToast] = useState("");
  const [mobileView, setMobileView] = useState<"inbox" | "chat">("inbox");
  const [activeNav, setActiveNav] = useState("Conversas");
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [newConversationName, setNewConversationName] = useState("");

  const active = conversations.find((item) => item.id === activeId) ?? conversations[0];
  const visible = useMemo(() => conversations.filter((item) => {
    const matchesSearch = (item.name + item.company + item.preview).toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "Todas" || (filter === "Não lidas" ? item.unread > 0 : filter === "Grupos" ? item.channel === "Grupo" : item.label === filter);
    return matchesSearch && matchesFilter;
  }), [conversations, filter, search]);

  function notify(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(""), 2600);
  }

  function chooseConversation(id: number) {
    setActiveId(id);
    setConversations((items) => items.map((item) => item.id === id ? { ...item, unread: 0 } : item));
    setMobileView("chat");
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = message.trim();
    if (!value) return;
    const now = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    setConversations((items) => items.map((item) => item.id === activeId ? {
      ...item,
      preview: value,
      time: now,
      messages: [...item.messages, { id: Date.now(), from: "me", text: value, time: now, status: "Demonstração local" }],
    } : item));
    setMessage("");
    notify("Mensagem adicionada apenas ao protótipo. Ela não foi enviada.");
  }

  function createConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newConversationName.trim();
    if (!name) return;
    const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
    const id = Math.max(0, ...conversations.map((item) => item.id)) + 1;
    const created: Conversation = {
      id,
      name,
      company: "Colaborador",
      initials,
      color: "sunshine",
      preview: "Conversa iniciada. Envie a primeira mensagem.",
      time: "Agora",
      unread: 0,
      channel: "Direta",
      label: "Geral",
      messages: [],
    };
    setConversations((items) => [created, ...items]);
    setActiveId(id);
    setMobileView("chat");
    setShowNewConversation(false);
    setNewConversationName("");
    notify("Conversa individual iniciada na demonstração.");
  }

  return (
    <main className="app-shell">
      <aside className="nav-rail" aria-label="Navegação principal">
        <div className="rail-brand"><BrandMark compact /></div>
        <button className={activeNav === "Conversas" ? "rail-button active" : "rail-button"} onClick={() => router.push("/conversas")} aria-label="Conversas" title="Conversas">▤</button>
        <button className="rail-button" onClick={() => router.push("/grupos")} aria-label="Grupos" title="Grupos">♧</button>
        <button className={activeNav === "Colaboradores" ? "rail-button active" : "rail-button"} onClick={() => router.push("/colaboradores")} aria-label="Colaboradores" title="Colaboradores">♙</button>
        <button className={activeNav === "Arquivos" ? "rail-button active" : "rail-button"} onClick={() => router.push("/arquivos")} aria-label="Arquivos" title="Arquivos">▥</button>
        <button className={activeNav === "Departamentos" ? "rail-button active" : "rail-button"} onClick={() => router.push("/departamentos")} aria-label="Departamentos" title="Departamentos">♧</button>
        <div className="rail-spacer" />
        <button className="rail-button" onClick={() => notify("Configurações em breve.")} aria-label="Configurações" title="Configurações">⚙</button>
        <div className="profile-mini">AC</div>
      </aside>

      <section className={mobileView === "chat" ? "inbox-panel mobile-hidden" : "inbox-panel"} aria-label="Caixa de entrada">
        <header className="inbox-header">
          <div className="workspace-line"><span className="workspace-avatar">N</span><div><strong>CONNEXA · Organização</strong><small>Comunicação interna · Organização</small></div><button className="icon-button" aria-label="Opções do workspace" onClick={() => notify("Opções do workspace.")}>⌄</button></div>
          <div className="inbox-title"><div><p className="eyebrow">COMUNICAÇÃO QUE APROXIMA</p><h1>Conversas <span className="count-pill">{conversations.length}</span></h1></div><button className="new-chat" onClick={() => setShowNewConversation(true)} aria-label="Nova conversa" title="Iniciar conversa individual"><span aria-hidden="true">＋</span><span className="new-chat-label">Nova</span></button></div>
          <label className="search-box"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar colaborador, grupo ou departamento" aria-label="Buscar colaborador, grupo ou departamento" /></label>
          <div className="filter-row" aria-label="Filtros de conversas">
            {["Todas", "Não lidas", "Grupos", "Tecnologia"].map((item) => <button key={item} className={filter === item ? "filter-chip selected" : "filter-chip"} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}
          </div>
        </header>
        <div className="conversation-list">
          <div className="list-caption"><span>CONVERSAS RECENTES</span><button onClick={() => notify("Ordenação por atividade recente.")}>Recentes⌄</button></div>
          {visible.map((item) => <button key={item.id} className={activeId === item.id ? "conversation active" : "conversation"} onClick={() => chooseConversation(item.id)}>
            <span className={"contact-avatar " + item.color}>{item.initials}{item.online && <i />}</span>
            <span className="conversation-copy"><span className="conversation-top"><strong>{item.name}</strong><time>{item.time}</time></span><span className="conversation-company">{item.company}</span><span className="conversation-bottom"><span>{item.preview}</span>{item.unread > 0 && <b className="unread-count">{item.unread}</b>}</span><span className="conversation-tags"><i className={item.channel === "Grupo" ? "channel-dot group" : "channel-dot direct"} />{item.channel === "Grupo" ? "Grupo" : "Direta"}<em>{item.label}</em></span></span>
          </button>)}
          {visible.length === 0 && <div className="empty-list"><span>⌕</span><strong>Nenhuma conversa encontrada</strong><p>Tente outro nome ou filtro.</p><button onClick={() => { setSearch(""); setFilter("Todas"); }}>Limpar busca</button></div>}
        </div>
        <footer className="inbox-footer"><span className="workspace-status-dot" aria-hidden="true" /> Ambiente organizacional <button onClick={() => router.push("/colaboradores")}>Ver equipe</button></footer>
      </section>

      <section className={mobileView === "inbox" ? "chat-panel mobile-hidden" : "chat-panel"} aria-label="Conversa selecionada">
        <header className="chat-header">
          <button className="back-button" onClick={() => setMobileView("inbox")} aria-label="Voltar para conversas">←</button>
          <span className={"contact-avatar small " + active.color}>{active.initials}</span>
          <button className="chat-person" onClick={() => setShowContact(!showContact)}><strong>{active.name}</strong><small>{active.channel === "Grupo" ? active.company : active.online ? "● Online agora" : active.company}</small></button>
          <span className="header-spacer" />
          <button className="header-action" onClick={() => notify("Busca nesta conversa.")} aria-label="Buscar na conversa">⌕</button>
          <button className="header-action" onClick={() => setShowContact(!showContact)} aria-label="Detalhes do contato">ⓘ</button>
          <button className="header-action" onClick={() => notify("Mais opções da conversa.")} aria-label="Mais opções">⋯</button>
        </header>
        <div className="chat-context"><span className="secure-icon" aria-hidden="true">✳</span> Protótipo local · mensagens não são enviadas nem armazenadas no servidor. <button onClick={() => notify("A segurança e a privacidade serão detalhadas na versão integrada.")}>Saiba mais</button></div>
        <div className="message-history" role="log" aria-label="Histórico demonstrativo da conversa" aria-live="polite" aria-relevant="additions">
          <div className="date-divider"><span>HOJE</span></div>
          {active.messages.map((item) => <div key={item.id} className={item.from === "me" ? "message-row outgoing" : "message-row incoming"}><div className="bubble">{item.text}<div className="bubble-meta">{item.time} {item.from === "me" && <span className="local-message-status">· local</span>}</div></div></div>)}
        </div>
        <form className="composer" onSubmit={sendMessage}>
          <button type="button" className="composer-tool" aria-label="Anexar arquivo" onClick={() => notify("O envio de arquivos será habilitado na integração de mensagens.")}>＋</button>
          <textarea rows={1} value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Escreva uma mensagem para sua equipe..." aria-label="Escreva uma mensagem para sua equipe" />
          <button className="send-button" type="submit" disabled={!message.trim()} aria-label="Enviar mensagem">➤</button>
        </form>
        <div className="composer-note">Demonstração local · Enter para adicionar ao protótipo · Shift + Enter para nova linha</div>
      </section>

      {showContact && <aside className="contact-panel">
        <div className="contact-panel-head"><strong>Detalhes do contato</strong><button className="icon-button" onClick={() => setShowContact(false)} aria-label="Fechar detalhes">×</button></div>
        <div className="contact-profile"><span className={"contact-avatar large " + active.color}>{active.initials}</span><h2>{active.name}</h2><p>{active.company}</p><span className="profile-channel">● {active.channel}</span></div>
        <div className="detail-section"><span className="detail-label">DEPARTAMENTO</span><p className="detail-value">{active.label}</p></div>
        <div className="detail-section"><span className="detail-label">PARTICIPANTES</span><p className="detail-placeholder">{active.channel === "Grupo" ? active.company : "Conversa individual entre colaboradores"}</p></div>
        <div className="detail-section"><span className="detail-label">INFORMAÇÕES</span><p className="detail-placeholder">Dados organizacionais e informações de acesso serão exibidos conforme as permissões do seu perfil.</p></div>
        <div className="detail-section"><span className="detail-label">HISTÓRICO</span><p className="detail-placeholder">As mensagens desta demonstração são locais e não representam registros permanentes.</p></div>
      </aside>}
      {showNewConversation && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowNewConversation(false); }}><form className="new-conversation-modal" onSubmit={createConversation} role="dialog" aria-modal="true" aria-labelledby="new-conversation-title"><div className="modal-heading"><div><p className="eyebrow">COMUNICAÇÃO INTERNA</p><h2 id="new-conversation-title">Nova conversa</h2></div><button type="button" className="icon-button" onClick={() => setShowNewConversation(false)} aria-label="Fechar">×</button></div><label className="modal-field">Colaborador<input autoFocus required value={newConversationName} onChange={(event) => setNewConversationName(event.target.value)} placeholder="Digite o nome do colaborador" /></label><div className="modal-actions"><button type="button" className="outline-button" onClick={() => setShowNewConversation(false)}>Cancelar</button><button type="submit" className="modal-submit">Iniciar conversa</button></div><p className="modal-disclaimer">Demonstração visual. O diretório real e a gestão de grupos e departamentos serão administrados pelo TI.</p></form></div>}\n      {toast && <div className="toast" role="status">{toast}</div>}
      <nav className="mobile-nav" aria-label="Navegação mobile"><button className={activeNav === "Conversas" ? "selected" : ""} aria-current={activeNav === "Conversas" ? "page" : undefined} onClick={() => router.push("/conversas")}>▤<span>Conversas</span></button><button className={activeNav === "Colaboradores" ? "selected" : ""} aria-current={activeNav === "Colaboradores" ? "page" : undefined} onClick={() => router.push("/colaboradores")}>♙<span>Colaboradores</span></button><button className={activeNav === "Departamentos" ? "selected" : ""} aria-current={activeNav === "Departamentos" ? "page" : undefined} onClick={() => router.push("/departamentos")}>♧<span>Departamentos</span></button><button className={activeNav === "Configurações" ? "selected" : ""} aria-current={activeNav === "Configurações" ? "page" : undefined} onClick={() => router.push("/admin")}>⚙<span>Ajustes</span></button></nav>
    </main>
  );
}
