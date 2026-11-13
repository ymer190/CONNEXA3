"use client";

import { FormEvent, useMemo, useState } from "react";
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
  channel: "WhatsApp" | "Site";
  label: string;
  online?: boolean;
  messages: Message[];
};

const initialConversations: Conversation[] = [
  { id: 1, name: "Mariana Costa", company: "Ateliê Mariana", initials: "MC", color: "mint", preview: "Consegue me enviar a proposta?", time: "09:42", unread: 2, channel: "WhatsApp", label: "Novo lead", online: true, messages: [
    { id: 1, from: "them", text: "Oi! Vi os planos de vocês e queria entender como funciona para minha loja.", time: "09:35" },
    { id: 2, from: "me", text: "Olá, Mariana! Que bom ter você por aqui. Posso te ajudar com isso 😊", time: "09:37", status: "Lida" },
    { id: 3, from: "them", text: "Hoje atendemos pelo WhatsApp e estamos perdendo algumas conversas.", time: "09:39" },
    { id: 4, from: "me", text: "Entendi. O Connexa reúne as conversas da equipe em uma única caixa de entrada.", time: "09:40", status: "Entregue" },
    { id: 5, from: "them", text: "Consegue me enviar a proposta?", time: "09:42" },
  ] },
  { id: 2, name: "Rafael Mendes", company: "RM Consultoria", initials: "RM", color: "blue", preview: "Perfeito, obrigado pelo retorno!", time: "09:28", unread: 0, channel: "WhatsApp", label: "Em negociação", messages: [
    { id: 1, from: "them", text: "Bom dia! Vocês atendem equipes com mais de 20 pessoas?", time: "09:18" },
    { id: 2, from: "me", text: "Sim! Temos recursos para equipes e distribuição de atendimentos.", time: "09:20", status: "Lida" },
    { id: 3, from: "them", text: "Perfeito, obrigado pelo retorno!", time: "09:28" },
  ] },
  { id: 3, name: "Camila Oliveira", company: "Clínica Horizonte", initials: "CO", color: "peach", preview: "Podemos agendar uma demonstração?", time: "Ontem", unread: 0, channel: "Site", label: "Prioridade", messages: [
    { id: 1, from: "them", text: "Olá! Gostaria de conhecer a plataforma para nossa recepção.", time: "16:10" },
    { id: 2, from: "me", text: "Claro, Camila. Podemos agendar uma demonstração.", time: "16:15", status: "Entregue" },
    { id: 3, from: "them", text: "Podemos agendar uma demonstração?", time: "16:20" },
  ] },
  { id: 4, name: "Pedro Almeida", company: "Almeida & Filhos", initials: "PA", color: "lilac", preview: "O pedido chegou certinho.", time: "Ontem", unread: 0, channel: "WhatsApp", label: "Cliente", messages: [
    { id: 1, from: "them", text: "Passando para confirmar o recebimento.", time: "14:02" },
    { id: 2, from: "me", text: "Recebemos sim, Pedro. Obrigado!", time: "14:10", status: "Lida" },
    { id: 3, from: "them", text: "O pedido chegou certinho.", time: "14:16" },
  ] },
];

const quickReplies = ["Olá! Como podemos ajudar?", "Vou verificar e já retorno.", "Podemos agendar uma demonstração?"];

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

  const active = conversations.find((item) => item.id === activeId) ?? conversations[0];
  const visible = useMemo(() => conversations.filter((item) => {
    const matchesSearch = (item.name + item.company + item.preview).toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "Todas" || (filter === "Não lidas" ? item.unread > 0 : item.label === filter);
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
      messages: [...item.messages, { id: Date.now(), from: "me", text: value, time: now, status: "Enviada" }],
    } : item));
    setMessage("");
    notify("Mensagem adicionada à conversa de demonstração.");
  }

  function setLabel(label: string) {
    setConversations((items) => items.map((item) => item.id === activeId ? { ...item, label } : item));
    notify("Etiqueta atualizada.");
  }

  return (
    <main className="app-shell">
      <aside className="nav-rail" aria-label="Navegação principal">
        <div className="rail-brand"><BrandMark compact /></div>
        <button className={activeNav === "Conversas" ? "rail-button active" : "rail-button"} onClick={() => setActiveNav("Conversas")} aria-label="Conversas" title="Conversas">▤</button>
        <button className={activeNav === "Contatos" ? "rail-button active" : "rail-button"} onClick={() => { setActiveNav("Contatos"); notify("Área de contatos: demonstração visual."); }} aria-label="Contatos" title="Contatos">♙</button>
        <button className={activeNav === "Relatórios" ? "rail-button active" : "rail-button"} onClick={() => { setActiveNav("Relatórios"); notify("Relatórios estarão disponíveis em uma próxima etapa."); }} aria-label="Relatórios" title="Relatórios">▥</button>
        <button className={activeNav === "Equipe" ? "rail-button active" : "rail-button"} onClick={() => { setActiveNav("Equipe"); notify("Área da equipe: demonstração visual."); }} aria-label="Equipe" title="Equipe">♧</button>
        <div className="rail-spacer" />
        <button className="rail-button" onClick={() => notify("Configurações em breve.")} aria-label="Configurações" title="Configurações">⚙</button>
        <div className="profile-mini">AC</div>
      </aside>

      <section className={mobileView === "chat" ? "inbox-panel mobile-hidden" : "inbox-panel"} aria-label="Caixa de entrada">
        <header className="inbox-header">
          <div className="workspace-line"><span className="workspace-avatar">N</span><div><strong>Nova Aurora</strong><small>Workspace empresarial</small></div><button className="icon-button" aria-label="Opções do workspace" onClick={() => notify("Opções do workspace.")}>⌄</button></div>
          <div className="inbox-title"><div><p className="eyebrow">ATENDIMENTO</p><h1>Conversas <span className="count-pill">{conversations.length}</span></h1></div><button className="new-chat" onClick={() => notify("Nova conversa: conecte um canal para começar.")} aria-label="Nova conversa">＋</button></div>
          <label className="search-box"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conversas ou contatos" aria-label="Buscar conversas ou contatos" /><kbd>⌘ K</kbd></label>
          <div className="filter-row" aria-label="Filtros de conversas">
            {["Todas", "Não lidas", "Novo lead", "Prioridade"].map((item) => <button key={item} className={filter === item ? "filter-chip selected" : "filter-chip"} onClick={() => setFilter(item)}>{item}</button>)}
          </div>
        </header>
        <div className="conversation-list">
          <div className="list-caption"><span>CAIXA DE ENTRADA</span><button onClick={() => notify("Ordenação por atividade recente.")}>Recentes⌄</button></div>
          {visible.map((item) => <button key={item.id} className={activeId === item.id ? "conversation active" : "conversation"} onClick={() => chooseConversation(item.id)}>
            <span className={"contact-avatar " + item.color}>{item.initials}{item.online && <i />}</span>
            <span className="conversation-copy"><span className="conversation-top"><strong>{item.name}</strong><time>{item.time}</time></span><span className="conversation-company">{item.company}</span><span className="conversation-bottom"><span>{item.preview}</span>{item.unread > 0 && <b className="unread-count">{item.unread}</b>}</span><span className="conversation-tags"><i className={item.channel === "WhatsApp" ? "channel-dot whatsapp" : "channel-dot web"} />{item.channel}<em>{item.label}</em></span></span>
          </button>)}
          {visible.length === 0 && <div className="empty-list"><span>⌕</span><strong>Nenhuma conversa encontrada</strong><p>Tente outro nome ou filtro.</p><button onClick={() => { setSearch(""); setFilter("Todas"); }}>Limpar busca</button></div>}
        </div>
        <footer className="inbox-footer"><span className="online-dot" /> 3 atendentes online <button onClick={() => notify("Visão da equipe.")}>Ver equipe</button></footer>
      </section>

      <section className={mobileView === "inbox" ? "chat-panel mobile-hidden" : "chat-panel"} aria-label="Conversa selecionada">
        <header className="chat-header">
          <button className="back-button" onClick={() => setMobileView("inbox")} aria-label="Voltar para conversas">←</button>
          <span className={"contact-avatar small " + active.color}>{active.initials}</span>
          <button className="chat-person" onClick={() => setShowContact(!showContact)}><strong>{active.name}</strong><small>{active.online ? "● Online agora" : active.company}</small></button>
          <span className="header-spacer" />
          <button className="header-action" onClick={() => notify("Busca nesta conversa.")} aria-label="Buscar na conversa">⌕</button>
          <button className="header-action" onClick={() => setShowContact(!showContact)} aria-label="Detalhes do contato">ⓘ</button>
          <button className="header-action" onClick={() => notify("Mais opções da conversa.")} aria-label="Mais opções">⋯</button>
        </header>
        <div className="chat-context"><span className="secure-icon">▣</span> Esta conversa é um canal de relacionamento com o cliente. <button onClick={() => notify("Detalhes de privacidade.")}>Saiba mais</button></div>
        <div className="message-history" aria-live="polite">
          <div className="date-divider"><span>HOJE</span></div>
          {active.messages.map((item) => <div key={item.id} className={item.from === "me" ? "message-row outgoing" : "message-row incoming"}><div className="bubble">{item.text}<div className="bubble-meta">{item.time} {item.from === "me" && <span>{item.status === "Lida" ? "✓✓" : "✓"}</span>}</div></div></div>)}
        </div>
        <div className="quick-replies"><span>RESPOSTAS RÁPIDAS</span>{quickReplies.map((reply) => <button key={reply} onClick={() => setMessage(reply)}>{reply}</button>)}</div>
        <form className="composer" onSubmit={sendMessage}>
          <button type="button" className="composer-tool" aria-label="Anexar arquivo" onClick={() => notify("Anexos estarão disponíveis quando o canal estiver conectado.")}>＋</button>
          <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Digite uma mensagem..." aria-label="Digite uma mensagem" />
          <button type="button" className="composer-tool" aria-label="Inserir resposta rápida" onClick={() => setMessage(quickReplies[0])}>ϟ</button>
          <button className="send-button" type="submit" disabled={!message.trim()} aria-label="Enviar mensagem">➤</button>
        </form>
        <div className="composer-note">Enter para enviar · Shift + Enter para nova linha</div>
      </section>

      {showContact && <aside className="contact-panel">
        <div className="contact-panel-head"><strong>Detalhes do contato</strong><button className="icon-button" onClick={() => setShowContact(false)} aria-label="Fechar detalhes">×</button></div>
        <div className="contact-profile"><span className={"contact-avatar large " + active.color}>{active.initials}</span><h2>{active.name}</h2><p>{active.company}</p><span className="profile-channel">● {active.channel}</span></div>
        <div className="detail-section"><span className="detail-label">ETIQUETA</span><select value={active.label} onChange={(event) => setLabel(event.target.value)} aria-label="Etiqueta do contato"><option>Novo lead</option><option>Em negociação</option><option>Prioridade</option><option>Cliente</option></select></div>
        <div className="detail-section"><span className="detail-label">RESPONSÁVEL</span><div className="assignee"><span className="assignee-avatar">AC</span><span>Ana Costa</span><span className="assigned">Atribuído</span></div></div>
        <div className="detail-section"><span className="detail-label">INFORMAÇÕES</span><p className="detail-placeholder">Adicione telefone, e-mail e observações para manter o contexto do relacionamento.</p><button className="outline-button" onClick={() => notify("Edição de contato em breve.")}>＋ Adicionar informação</button></div>
        <div className="detail-section"><span className="detail-label">AÇÕES</span><button className="outline-button" onClick={() => notify("Histórico do cliente.")}>Ver histórico do cliente</button></div>
      </aside>}
      {toast && <div className="toast" role="status">{toast}</div>}
      <nav className="mobile-nav" aria-label="Navegação mobile"><button className="selected" onClick={() => setMobileView("inbox")}>▤<span>Conversas</span></button><button onClick={() => notify("Contatos em breve.")}>♙<span>Contatos</span></button><button onClick={() => notify("Equipe em breve.")}>♧<span>Equipe</span></button><button onClick={() => notify("Configurações em breve.")}>⚙<span>Ajustes</span></button></nav>
    </main>
  );
}
