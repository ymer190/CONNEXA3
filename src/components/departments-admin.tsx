"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./departments-admin.module.css";

type Organization = { id: string; name: string };
type DepartmentStatus = "active" | "inactive";
type Department = { id: string; name: string; status: DepartmentStatus };
type DepartmentMember = {
  id: string;
  name: string;
  status: "active" | "historical";
  since: string;
};
type ApiResponse<T> = { success: true; data: T } | {
  success: false;
  error?: { code?: string; message?: string };
};

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as ApiResponse<T>;
  if (!response.ok || !body.success) {
    const error = !body.success ? body.error?.message : undefined;
    throw new Error(error || "Não foi possível concluir a consulta.");
  }
  return body.data;
}

export function DepartmentsAdmin() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [organizationState, setOrganizationState] = useState<"loading" | "ready" | "error">("loading");
  const [organizationError, setOrganizationError] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentState, setDepartmentState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [departmentError, setDepartmentError] = useState("");
  const [membersByDepartment, setMembersByDepartment] = useState<Record<string, DepartmentMember[]>>({});
  const [membersLoading, setMembersLoading] = useState<string | null>(null);
  const [membersError, setMembersError] = useState<Record<string, string>>({});
  const [expandedDepartmentId, setExpandedDepartmentId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | DepartmentStatus>("all");

  useEffect(() => {
    const controller = new AbortController();
    async function loadOrganizations() {
      setOrganizationState("loading");
      setOrganizationError("");
      try {
        const response = await fetch("/api/admin/departments/organizations", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await readResponse<Organization[]>(response);
        setOrganizations(data);
        setOrganizationState("ready");
        if (data.length > 0) setSelectedOrganizationId((current) => current || data[0].id);
      } catch (error) {
        if (controller.signal.aborted) return;
        setOrganizationError(error instanceof Error ? error.message : "Não foi possível carregar as organizações.");
        setOrganizationState("error");
      }
    }
    void loadOrganizations();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedOrganizationId) {
      setDepartments([]);
      setDepartmentState("idle");
      return;
    }
    const controller = new AbortController();
    async function loadDepartments() {
      setDepartmentState("loading");
      setDepartmentError("");
      setExpandedDepartmentId(null);
      setMembersByDepartment({});
      try {
        const response = await fetch(
          `/api/admin/departments?organizationId=${encodeURIComponent(selectedOrganizationId)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const data = await readResponse<Department[]>(response);
        setDepartments(data);
        setDepartmentState("ready");
      } catch (error) {
        if (controller.signal.aborted) return;
        setDepartmentError(error instanceof Error ? error.message : "Não foi possível carregar os departamentos.");
        setDepartmentState("error");
      }
    }
    void loadDepartments();
    return () => controller.abort();
  }, [selectedOrganizationId]);

  const loadMembers = useCallback(async (departmentId: string) => {
    if (!selectedOrganizationId) return;
    if (expandedDepartmentId === departmentId) {
      setExpandedDepartmentId(null);
      return;
    }
    setExpandedDepartmentId(departmentId);
    if (membersByDepartment[departmentId]) return;
    setMembersLoading(departmentId);
    setMembersError((current) => ({ ...current, [departmentId]: "" }));
    try {
      const response = await fetch(
        `/api/admin/departments/${encodeURIComponent(departmentId)}/members?organizationId=${encodeURIComponent(selectedOrganizationId)}`,
        { cache: "no-store" },
      );
      const data = await readResponse<DepartmentMember[]>(response);
      setMembersByDepartment((current) => ({ ...current, [departmentId]: data }));
    } catch (error) {
      setMembersError((current) => ({
        ...current,
        [departmentId]: error instanceof Error ? error.message : "Não foi possível carregar os colaboradores.",
      }));
    } finally {
      setMembersLoading(null);
    }
  }, [expandedDepartmentId, membersByDepartment, selectedOrganizationId]);

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
            Selecione uma organização para consultar seus departamentos e os colaboradores vinculados.
          </p>
        </div>
        <Link className={styles.backLink} href="/admin">Voltar à administração</Link>
      </header>

      <section className={styles.panel} aria-labelledby="organization-selector-title">
        <div>
          <p className={styles.eyebrow}>ESCOPO ADMINISTRATIVO</p>
          <h2 id="organization-selector-title">Organização</h2>
        </div>
        {organizationState === "loading" && <div className={styles.feedback} role="status">Carregando organizações…</div>}
        {organizationState === "error" && <div className={styles.feedbackError} role="alert">{organizationError}</div>}
        {organizationState === "ready" && organizations.length === 0 && (
          <div className={styles.feedback} role="status">Nenhuma organização está disponível para sua conta administrativa.</div>
        )}
        {organizationState === "ready" && organizations.length > 0 && (
          <label className={styles.organizationSelect}>
            <span>Escolha a organização que deseja administrar</span>
            <select
              value={selectedOrganizationId}
              onChange={(event) => setSelectedOrganizationId(event.target.value)}
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>{organization.name}</option>
              ))}
            </select>
          </label>
        )}
      </section>

      <section className={styles.summary} aria-label="Resumo dos departamentos">
        <div><span>Departamentos visíveis</span><strong>{departmentState === "ready" ? departments.length : "—"}</strong></div>
        <div><span>Ativos</span><strong>{departmentState === "ready" ? departments.filter((item) => item.status === "active").length : "—"}</strong></div>
        <div><span>Inativos</span><strong>{departmentState === "ready" ? departments.filter((item) => item.status === "inactive").length : "—"}</strong></div>
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

        {!selectedOrganizationId && organizationState === "ready" && organizations.length > 0 && (
          <div className={styles.feedback} role="status">Selecione uma organização para consultar os departamentos.</div>
        )}
        {departmentState === "loading" && <div className={styles.feedback} role="status" aria-busy="true">Carregando departamentos…</div>}
        {departmentState === "error" && <div className={styles.feedbackError} role="alert">{departmentError}</div>}
        {departmentState === "ready" && filteredDepartments.length === 0 && (
          <div className={styles.feedback} role="status">
            {departments.length === 0 ? "Nenhum departamento cadastrado nesta organização." : "Nenhum departamento corresponde à busca."}
          </div>
        )}
        {departmentState === "ready" && filteredDepartments.length > 0 && (
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Departamento</th><th>Status</th><th>Colaboradores</th><th>Detalhes</th></tr></thead>
              <tbody>
                {filteredDepartments.map((department) => {
                  const members = membersByDepartment[department.id];
                  return (
                    <FragmentRow
                      key={department.id}
                      department={department}
                      members={members}
                      expanded={expandedDepartmentId === department.id}
                      loading={membersLoading === department.id}
                      error={membersError[department.id]}
                      onToggle={() => void loadMembers(department.id)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className={styles.note} id="department-actions-note">
          Criação, edição, desativação e transferência permanecem bloqueadas até a integração com a auditoria central e a validação dos gates de segurança.
        </p>
      </section>

      <nav className={styles.related} aria-label="Outras áreas administrativas">
        <Link href="/admin/usuarios">Gerenciar usuários e permissões <span aria-hidden="true">→</span></Link>
      </nav>
    </main>
  );
}

function FragmentRow({
  department,
  members,
  expanded,
  loading,
  error,
  onToggle,
}: {
  department: Department;
  members?: DepartmentMember[];
  expanded: boolean;
  loading: boolean;
  error?: string;
  onToggle: () => void;
}) {
  return (
    <>
      <tr>
        <td>{department.name}</td>
        <td><span className={department.status === "active" ? styles.active : styles.inactive}>{department.status === "active" ? "Ativo" : "Inativo"}</span></td>
        <td>{members ? members.filter((member) => member.status === "active").length : "—"}</td>
        <td>
          <button className={styles.detailButton} type="button" onClick={onToggle} aria-expanded={expanded}>
            {expanded ? "Fechar" : "Ver colaboradores"}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={4}>
            {loading && <div className={styles.memberFeedback} role="status">Carregando colaboradores…</div>}
            {error && <div className={styles.feedbackError} role="alert">{error}</div>}
            {members && members.length === 0 && <div className={styles.memberFeedback}>Nenhum vínculo encontrado para este departamento.</div>}
            {members && members.length > 0 && (
              <div className={styles.memberList}>
                {members.map((member, index) => (
                  <div className={styles.memberItem} key={`${member.id}-${index}`}>
                    <span>{member.name}</span>
                    <span className={member.status === "active" ? styles.active : styles.inactive}>
                      {member.status === "active" ? "Vínculo ativo" : "Histórico"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
