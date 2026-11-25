"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "./users-admin.module.css";

type AccountStatus = "active" | "blocked" | "deactivated";
type ManagedUser = {
  id: string;
  name: string;
  departmentName: string;
  status: AccountStatus;
  permissionSummary?: string;
};

type UsersAdminProps = {
  users?: ManagedUser[];
  integrationState?: "pending" | "loading" | "ready" | "error";
};

const statusLabels: Record<AccountStatus, string> = {
  active: "Ativo",
  blocked: "Bloqueado",
  deactivated: "Desativado",
};

export function UsersAdmin({ users = [], integrationState = "pending" }: UsersAdminProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | AccountStatus>("all");

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return users.filter((user) => {
      const matchesName = user.name.toLocaleLowerCase("pt-BR").includes(term);
      const matchesStatus = status === "all" || user.status === status;
      return matchesName && matchesStatus;
    });
  }, [search, status, users]);

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>ADMINISTRAÇÃO · CONTAS E ACESSOS</p>
          <h1>Usuários e permissões</h1>
          <p className={styles.description}>
            Consulte contas de colaboradores e administre status e permissões dentro das regras aprovadas.
          </p>
        </div>
        <Link className={styles.backLink} href="/admin">Voltar à administração</Link>
      </header>

      <section className={styles.summary} aria-label="Resumo de contas">
        <div><span>Contas visíveis</span><strong>{integrationState === "ready" ? users.length : "—"}</strong></div>
        <div><span>Ativas</span><strong>{integrationState === "ready" ? users.filter((user) => user.status === "active").length : "—"}</strong></div>
        <div><span>Bloqueadas ou desativadas</span><strong>{integrationState === "ready" ? users.filter((user) => user.status !== "active").length : "—"}</strong></div>
      </section>

      <section className={styles.panel} aria-labelledby="users-list-title">
        <div className={styles.panelHeading}>
          <div>
            <p className={styles.eyebrow}>GESTÃO DE COLABORADORES</p>
            <h2 id="users-list-title">Contas cadastradas</h2>
          </div>
          <button className={styles.primaryButton} type="button" disabled aria-describedby="user-actions-note">
            Cadastrar colaborador
          </button>
        </div>

        <div className={styles.filters}>
          <label className={styles.search}>
            <span aria-hidden="true">⌕</span>
            <span className={styles.srOnly}>Buscar usuário pelo nome</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar colaborador pelo nome" />
          </label>
          <label className={styles.statusFilter}>
            <span>Status da conta</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as "all" | AccountStatus)}>
              <option value="all">Todos os status</option>
              <option value="active">Ativos</option>
              <option value="blocked">Bloqueados</option>
              <option value="deactivated">Desativados</option>
            </select>
          </label>
        </div>

        {integrationState === "pending" && (
          <div className={styles.notice} role="status">
            <span className={styles.noticeIcon} aria-hidden="true">↗</span>
            <div>
              <h3>Integração administrativa pendente</h3>
              <p>A interface está preparada, mas listagem, cadastro, alteração de status e gestão de permissões dependem dos contratos e serviços validados nas Issues #92, #94, #96 e #106. Nenhum usuário fictício será exibido e nenhuma operação será simulada.</p>
            </div>
          </div>
        )}
        {integrationState === "loading" && (
          <div className={styles.feedback} role="status" aria-busy="true">Carregando contas autorizadas…</div>
        )}
        {integrationState === "error" && (
          <div className={styles.feedback} role="alert">Não foi possível carregar as contas. Tente novamente quando o serviço estiver disponível.</div>
        )}
        {integrationState === "ready" && filteredUsers.length === 0 && (
          <div className={styles.feedback} role="status">
            {users.length === 0 ? "Nenhuma conta disponível para consulta." : "Nenhum usuário corresponde à busca."}
          </div>
        )}
        {integrationState === "ready" && filteredUsers.length > 0 && (
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Colaborador</th><th>Departamento</th><th>Status</th><th>Permissões</th><th>Ações</th></tr></thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.departmentName || "Não informado"}</td>
                    <td><span className={styles.status}>{statusLabels[user.status]}</span></td>
                    <td>{user.permissionSummary ?? "Conforme perfil"}</td>
                    <td><span className={styles.pendingAction}>Integração pendente</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={styles.note} id="user-actions-note">
          A autorização será validada no servidor em cada operação. Ocultar controles na interface não substitui autorização nem políticas de segurança.
        </p>
      </section>

      <nav className={styles.related} aria-label="Outras áreas administrativas">
        <Link href="/admin/departamentos">Gerenciar departamentos <span aria-hidden="true">→</span></Link>
      </nav>
    </main>
  );
}
