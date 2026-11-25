"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./security-admin.module.css";

type Section = "devices" | "audit" | "conversations";

const sections: { id: Section; href: string; label: string; description: string }[] = [
  { id: "devices", href: "/admin/dispositivos", label: "Dispositivos", description: "Sessões e dispositivos autorizados" },
  { id: "audit", href: "/admin/auditoria", label: "Auditoria", description: "Registros administrativos somente leitura" },
  { id: "conversations", href: "/admin/consultas", label: "Consultas", description: "Consulta administrativa autorizada" },
];

const copy: Record<Section, { eyebrow: string; title: string; description: string }> = {
  devices: {
    eyebrow: "ADMINISTRAÇÃO · SEGURANÇA",
    title: "Dispositivos e sessões",
    description: "Consulte os dispositivos vinculados às contas corporativas e o estado das sessões, conforme os dados liberados pelo serviço administrativo.",
  },
  audit: {
    eyebrow: "ADMINISTRAÇÃO · CONFORMIDADE",
    title: "Registros de auditoria",
    description: "Consulte eventos administrativos sem alterar ou remover registros. Os filtros serão conectados à paginação definida pelo Back-end.",
  },
  conversations: {
    eyebrow: "ADMINISTRAÇÃO · ACESSO EXCEPCIONAL",
    title: "Consulta de conversas",
    description: "Área reservada para consultas somente leitura, limitadas ao escopo autorizado pelo Back-end e acompanhadas do contexto da autorização.",
  },
};

export function SecurityAdmin({ section }: { section: Section }) {
  const [deviceSearch, setDeviceSearch] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [auditType, setAuditType] = useState("all");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [conversationTerm, setConversationTerm] = useState("");
  const [conversationPeriod, setConversationPeriod] = useState("");

  const current = copy[section];

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>{current.eyebrow}</p>
          <h1>{current.title}</h1>
          <p className={styles.description}>{current.description}</p>
        </div>
        <Link className={styles.backLink} href="/admin">Voltar à administração</Link>
      </header>

      <nav className={styles.tabs} aria-label="Módulos de segurança administrativa">
        {sections.map((item) => (
          <Link key={item.id} href={item.href} aria-current={section === item.id ? "page" : undefined} className={section === item.id ? styles.activeTab : styles.tab}>
            <strong>{item.label}</strong>
            <span>{item.description}</span>
          </Link>
        ))}
      </nav>

      {section === "devices" && (
        <>
          <section className={styles.summary} aria-label="Resumo de dispositivos">
            <div><span>Dispositivos encontrados</span><strong>—</strong></div>
            <div><span>Sessões ativas</span><strong>—</strong></div>
            <div><span>Revogações recentes</span><strong>—</strong></div>
          </section>
          <section className={styles.panel} aria-labelledby="devices-title">
            <div className={styles.panelHeading}>
              <div><p className={styles.eyebrow}>CONTROLE DE ACESSO</p><h2 id="devices-title">Dispositivos autorizados</h2></div>
              <span className={styles.readOnly}>Somente leitura nesta etapa</span>
            </div>
            <label className={styles.search}>
              <span aria-hidden="true">⌕</span>
              <span className={styles.srOnly}>Buscar dispositivo ou colaborador</span>
              <input value={deviceSearch} onChange={(event) => setDeviceSearch(event.target.value)} placeholder="Buscar por colaborador ou identificação do dispositivo" />
            </label>
            <div className={styles.notice} role="status">
              <span className={styles.noticeIcon} aria-hidden="true">⌁</span>
              <div><h3>Serviço de dispositivos aguardando integração</h3><p>Nenhum dispositivo será inventado ou exibido como real. A listagem, os estados de sessão e os dados visíveis serão fornecidos pelo Back-end após validação dos contratos #97 e #106.</p></div>
            </div>
            <p className={styles.note}>A ação de revogar sessão será habilitada somente quando existir uma operação server-side autorizada. A confirmação e o resultado real serão exibidos nessa etapa; nenhuma revogação é simulada aqui.</p>
          </section>
        </>
      )}

      {section === "audit" && (
        <>
          <section className={styles.summary} aria-label="Resumo de auditoria">
            <div><span>Eventos no período</span><strong>—</strong></div>
            <div><span>Eventos administrativos</span><strong>—</strong></div>
            <div><span>Última atualização</span><strong>—</strong></div>
          </section>
          <section className={styles.panel} aria-labelledby="audit-title">
            <div className={styles.panelHeading}>
              <div><p className={styles.eyebrow}>TRILHA DE RASTREABILIDADE</p><h2 id="audit-title">Histórico de eventos</h2></div>
              <span className={styles.readOnly}>Registro imutável</span>
            </div>
            <div className={styles.filters}>
              <label className={styles.search}><span aria-hidden="true">⌕</span><span className={styles.srOnly}>Buscar evento</span><input value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} placeholder="Buscar por ação ou responsável" /></label>
              <label className={styles.field}>Tipo de evento<select value={auditType} onChange={(event) => setAuditType(event.target.value)}><option value="all">Todos os tipos</option><option value="access">Acesso administrativo</option><option value="device">Dispositivo e sessão</option><option value="account">Conta e permissão</option></select></label>
              <label className={styles.field}>De<input type="date" value={auditFrom} onChange={(event) => setAuditFrom(event.target.value)} /></label>
              <label className={styles.field}>Até<input type="date" value={auditTo} onChange={(event) => setAuditTo(event.target.value)} /></label>
            </div>
            <div className={styles.notice} role="status">
              <span className={styles.noticeIcon} aria-hidden="true">◷</span>
              <div><h3>Consulta de auditoria aguardando integração</h3><p>Os filtros estão preparados na interface, mas não consultam dados locais ou fictícios. A busca, a ordenação e a paginação serão conectadas ao contrato de auditoria da #97/#106.</p></div>
            </div>
            <div className={styles.pagination} aria-label="Paginação indisponível até a integração"><button type="button" disabled>Anterior</button><span>Página — de —</span><button type="button" disabled>Próxima</button></div>
            <p className={styles.note}>A interface não oferece ações para editar ou apagar eventos. Os registros serão apresentados exatamente conforme fornecidos pelo serviço autorizado.</p>
          </section>
        </>
      )}

      {section === "conversations" && (
        <section className={styles.panel} aria-labelledby="conversation-title">
          <div className={styles.panelHeading}>
            <div><p className={styles.eyebrow}>CONSULTA EXCEPCIONAL</p><h2 id="conversation-title">Localizar conversa autorizada</h2></div>
            <span className={styles.readOnly}>Somente leitura</span>
          </div>
          <div className={styles.notice} role="note">
            <span className={styles.noticeIcon} aria-hidden="true">⚑</span>
            <div><h3>Acesso condicionado à autorização do Back-end</h3><p>Esta tela não concede privilégios. A consulta só poderá ocorrer após validação server-side da permissão específica, escopo autorizado e justificativa registrada em auditoria.</p></div>
          </div>
          <div className={styles.conversationForm}>
            <label className={styles.field}>Identificador ou termo de busca<input value={conversationTerm} onChange={(event) => setConversationTerm(event.target.value)} placeholder="Aguardando contrato de pesquisa" /></label>
            <label className={styles.field}>Período de referência<input type="text" value={conversationPeriod} onChange={(event) => setConversationPeriod(event.target.value)} placeholder="Ex.: intervalo definido pelo serviço" /></label>
            <label className={styles.field}>Justificativa da consulta<textarea rows={3} placeholder="A justificativa será exigida e registrada pelo fluxo autorizado." disabled /></label>
            <button className={styles.primaryButton} type="button" disabled aria-describedby="consultation-note">Consultar conversa</button>
          </div>
          <p className={styles.note} id="consultation-note">Consulta, justificativa obrigatória, visualização de mensagens e contexto da autorização dependem dos contratos #96/#106 e dos serviços de conversas/mensagens. Nenhuma conversa, notificação ou autorização é simulada.</p>
          <p className={styles.privacy}>A regra do produto de não enviar notificação individual imediata ao colaborador será respeitada pela interface; a execução e a auditoria desse acesso são responsabilidades server-side.</p>
        </section>
      )}
    </main>
  );
}
