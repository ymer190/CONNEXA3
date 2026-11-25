"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "./departments-admin.module.css";

type DepartmentStatus = "active" | "inactive";
type Department = {
  id: string;
  name: string;
  status: DepartmentStatus;
  memberCount?: number;
};

type DepartmentsAdminProps = {
  departments?: Department[];
  integrationState?: "pending" | "loading" | "ready" | "error";
};

export function DepartmentsAdmin({
  departments = [],
  integrationState = "pending",
}: DepartmentsAdminProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | DepartmentStatus>("all");

  const filteredDepartments = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return departments.filter((department) => {
      const matchesName = department.name.toLocaleLowerCase("pt-BR").includes(term);
      const matchesStatus = status === "all" || department.status === status;
      return matchesName && matchesStatus;
    });
  }, [departments, search, status]);

  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>ADMINISTRAÇÃO · ESTRUTURA ORGANIZACIONAL</p>
          <h1>Departamentos e setores</h1>
          <p className={styles.description}>
            Consulte a estrutura da organização e gerencie departamentos conforme as permissões administrativas.
          </p>
        </div>
        <Link className={styles.backLink} href="/admin">Voltar à administração</Link>
      </header>

      <section className={styles.summary} aria-label="Resumo dos departamentos">
        <div><span>Departamentos visíveis</span><strong>{integrationState === "ready" ? departments.length : "—"}</strong></div>
        <div><span>Ativos</span><strong>{integrationState === "ready" ? departments.filter((item) => item.status === "active").length : "—"}</strong></div>
        <div><span>Inativos</span><strong>{integrationState === "ready" ? departments.filter((item) => item.status === "inactive").length : "—"}</strong></div>
      </section>

      <section className={styles.panel} aria-labelledby="departments-list-title">
        <div className={styles.panelHeading}>
          <div>
            <p className={styles.eyebrow}>CADASTRO ORGANIZACIONAL</p>
            <h2 id="departments-list-title">Lista de departamentos</h2>
          </div>
          <button className={styles.primaryButton} type="button" disabled aria-describedby="department-actions-note">
            Novo departamento
          </button>
        </div>

        <div className={styles.filters}>
          <label className={styles.search}>
            <span aria-hidden="true">⌕</span>
            <span className={styles.srOnly}>Buscar departamento pelo nome</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar departamento" />
          </label>
          <label className={styles.statusFilter}>
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as "all" | DepartmentStatus)}>
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
          </label>
        </div>

        {integrationState === "pending" && (
          <div className={styles.notice} role="status">
            <span className={styles.noticeIcon} aria-hidden="true">↗</span>
            <div>
              <h3>Integração com o domínio departamental pendente</h3>
              <p>A interface está preparada, mas a consulta e as operações ainda aguardam a integração validada com o Back-end e a publicação do contrato da #95. Nenhum departamento fictício será exibido.</p>
            </div>
          </div>
        )}
        {integrationState === "loading" && (
          <div className={styles.feedback} role="status" aria-busy="true">Carregando departamentos…</div>
        )}
        {integrationState === "error" && (
          <div className={styles.feedback} role="alert">Não foi possível carregar os departamentos. Tente novamente quando o serviço estiver disponível.</div>
        )}
        {integrationState === "ready" && filteredDepartments.length === 0 && (
          <div className={styles.feedback} role="status">
            {departments.length === 0 ? "Nenhum departamento disponível." : "Nenhum departamento corresponde à busca."}
          </div>
        )}
        {integrationState === "ready" && filteredDepartments.length > 0 && (
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Departamento</th><th>Status</th><th>Colaboradores</th></tr></thead>
              <tbody>
                {filteredDepartments.map((department) => (
                  <tr key={department.id}>
                    <td>{department.name}</td>
                    <td><span className={department.status === "active" ? styles.active : styles.inactive}>{department.status === "active" ? "Ativo" : "Inativo"}</span></td>
                    <td>{department.memberCount ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={styles.note} id="department-actions-note">
          Criação, edição, desativação e consulta de vínculos serão habilitadas após validação conjunta dos contratos, autorização server-side e auditoria.
        </p>
      </section>

      <nav className={styles.related} aria-label="Outras áreas administrativas">
        <Link href="/admin/usuarios">Gerenciar usuários e permissões <span aria-hidden="true">→</span></Link>
      </nav>
    </main>
  );
}
