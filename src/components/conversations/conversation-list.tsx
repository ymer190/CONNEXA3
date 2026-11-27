"use client";

import { useMemo, useState } from "react";
import { Avatar } from "@/components/conversations/avatar";
import type { ConversationSummary } from "@/types/conversations";

type ConversationListProps = {
  conversations: ConversationSummary[];
  activeId: string;
  loading: boolean;
  mobileHidden?: boolean;
  onSelect: (conversation: ConversationSummary) => void;
  onCreate: () => void;
};

type Filter = "all" | "unread" | "direct" | "group";

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "unread", label: "Não lidas" },
  { id: "direct", label: "Individuais" },
  { id: "group", label: "Grupos" },
];

export function ConversationList({ conversations, activeId, loading, mobileHidden = false, onSelect, onCreate }: ConversationListProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const visible = useMemo(() => conversations.filter((conversation) => {
    const haystack = [conversation.name, conversation.subtitle, conversation.lastMessagePreview].join(" ").toLocaleLowerCase("pt-BR");
    const matchesSearch = haystack.includes(search.trim().toLocaleLowerCase("pt-BR"));
    const matchesFilter = filter === "all"
      || (filter === "unread" && conversation.unreadCount > 0)
      || (filter === "direct" && conversation.kind === "direct")
      || (filter === "group" && conversation.kind === "group");
    return matchesSearch && matchesFilter;
  }), [conversations, filter, search]);

  return (
    <aside className={"cx-inbox " + (mobileHidden ? "cx-mobile-hidden" : "")} aria-label="Lista de conversas">
      <header className="cx-inbox-header">
        <div className="cx-workspace">
          <span className="cx-workspace-mark">C</span>
          <div><strong>CONNEXA</strong><span>Espaço de trabalho</span></div>
          <span className="cx-workspace-menu" aria-hidden="true">⌄</span>
        </div>
        <div className="cx-inbox-title">
          <div><p className="cx-eyebrow">COMUNICAÇÃO INTERNA</p><h1>Conversas <span>{conversations.length}</span></h1></div>
          <button className="cx-new-button" type="button" onClick={onCreate} aria-label="Nova conversa">＋</button>
        </div>
        <label className="cx-search">
          <span aria-hidden="true">⌕</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conversas" aria-label="Buscar conversas" />
          {search && <button type="button" onClick={() => setSearch("")} aria-label="Limpar busca">×</button>}
        </label>
        <div className="cx-filter-list" role="group" aria-label="Filtrar conversas">
          {filters.map((item) => (
            <button key={item.id} type="button" className={filter === item.id ? "cx-filter is-active" : "cx-filter"} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>
          ))}
        </div>
      </header>

      <div className="cx-list-scroll">
        <div className="cx-section-label"><span>RECENTES</span><span>Ordenadas por atividade</span></div>
        {loading ? (
          <div className="cx-list-skeleton" aria-label="Carregando conversas">
            {[0, 1, 2, 3].map((item) => <div className="cx-skeleton-row" key={item}><i /><span><b /><small /></span></div>)}
          </div>
        ) : visible.length > 0 ? (
          <div className="cx-conversation-list">
            {visible.map((conversation) => (
              <button key={conversation.id} type="button" className={activeId === conversation.id ? "cx-conversation is-active" : "cx-conversation"} onClick={() => onSelect(conversation)} aria-current={activeId === conversation.id ? "true" : undefined}>
                <Avatar initials={conversation.initials} tone={conversation.avatarTone} online={conversation.online} />
                <span className="cx-conversation-info">
                  <span className="cx-conversation-heading"><strong>{conversation.name}</strong><time dateTime={conversation.updatedAt}>{formatShortTime(conversation.updatedAt)}</time></span>
                  <span className="cx-conversation-subtitle">{conversation.subtitle}</span>
                  <span className="cx-conversation-preview"><span>{conversation.lastMessagePreview}</span>{conversation.unreadCount > 0 && <b aria-label={conversation.unreadCount + " não lidas"}>{conversation.unreadCount}</b>}</span>
                  <span className="cx-kind-label">{conversation.kind === "group" ? "▧ Grupo" : "◉ Individual"}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="cx-empty-list"><span aria-hidden="true">⌕</span><strong>Nenhuma conversa encontrada</strong><p>Ajuste a busca ou o filtro para ver outras conversas.</p><button type="button" onClick={() => { setSearch(""); setFilter("all"); }}>Limpar filtros</button></div>
        )}
      </div>
      <footer className="cx-inbox-footer"><i /> <span>Modo de demonstração</span><span className="cx-demo-mark">DADOS LOCAIS</span></footer>
    </aside>
  );
}

function formatShortTime(value: string) {
  const date = new Date(value);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay ? date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
