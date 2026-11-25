"use client";

import { useMemo, useState } from "react";

export type DirectoryCollaborator = {
  id: string;
  name: string;
  departmentName: string;
};

type DirectoryState = "pending" | "loading" | "ready" | "error";

type CollaboratorsDirectoryProps = {
  collaborators: DirectoryCollaborator[];
  state: DirectoryState;
};

export function CollaboratorsDirectory({ collaborators, state }: CollaboratorsDirectoryProps) {
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");

  const departments = useMemo(
    () => Array.from(new Set(collaborators.map((person) => person.departmentName).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [collaborators],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return collaborators.filter((person) => {
      const matchesName = !term || person.name.toLocaleLowerCase("pt-BR").includes(term);
      const matchesDepartment = department === "all" || person.departmentName === department;
      return matchesName && matchesDepartment;
    });
  }, [collaborators, department, search]);

  return (
    <section className="directory-page" aria-labelledby="directory-heading">
      <div className="directory-intro">
        <div>
          <p className="module-eyebrow">PESSOAS DA ORGANIZAÇÃO</p>
          <h2 id="directory-heading">Diretório de colaboradores</h2>
          <p>Localize colegas pelo nome ou departamento, respeitando o escopo de acesso da sua conta.</p>
        </div>
      </div>

      <div className="directory-controls">
        <label className="directory-search">
          <span aria-hidden="true">⌕</span>
          <span className="sr-only">Buscar por nome</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar colaborador pelo nome"
            autoComplete="off"
          />
        </label>
        <label className="directory-filter">
          <span>Departamento</span>
          <select value={department} onChange={(event) => setDepartment(event.target.value)} disabled={departments.length === 0}>
            <option value="all">Todos os departamentos</option>
            {departments.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
      </div>

      {state === "pending" && (
        <div className="directory-feedback" role="status">
          <span className="directory-feedback-icon" aria-hidden="true">⌕</span>
          <h3>Diretório aguardando integração</h3>
          <p>A interface de busca está preparada, mas a consulta de colaboradores ainda depende do contrato de usuários e das regras de visibilidade validadas entre Front-end e Back-end. Nenhum dado fictício será exibido como real.</p>
        </div>
      )}

      {state === "loading" && (
        <div className="directory-list" aria-label="Carregando colaboradores" aria-busy="true">
          {[1, 2, 3].map((item) => <div className="directory-skeleton" key={item}><span /><div><i /><i /></div></div>)}
        </div>
      )}

      {state === "error" && (
        <div className="directory-feedback" role="alert">
          <span className="directory-feedback-icon" aria-hidden="true">!</span>
          <h3>Não foi possível carregar o diretório</h3>
          <p>Tente novamente quando a integração com o serviço estiver disponível.</p>
        </div>
      )}

      {state === "ready" && filtered.length === 0 && (
        <div className="directory-feedback" role="status">
          <span className="directory-feedback-icon" aria-hidden="true">⌕</span>
          <h3>{collaborators.length === 0 ? "Nenhum colaborador disponível" : "Nenhum resultado encontrado"}</h3>
          <p>{collaborators.length === 0 ? "Não há colaboradores visíveis para sua conta neste momento." : "Experimente outro nome ou departamento."}</p>
          {(search || department !== "all") && <button type="button" className="directory-clear" onClick={() => { setSearch(""); setDepartment("all"); }}>Limpar filtros</button>}
        </div>
      )}

      {state === "ready" && filtered.length > 0 && (
        <div className="directory-list" aria-label="Lista de colaboradores">
          <p className="directory-result-count">{filtered.length} {filtered.length === 1 ? "colaborador encontrado" : "colaboradores encontrados"}</p>
          {filtered.map((person) => {
            const initials = person.name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toLocaleUpperCase("pt-BR");
            return (
              <article className="directory-person" key={person.id}>
                <span className="directory-avatar" aria-hidden="true">{initials || "?"}</span>
                <div className="directory-person-copy">
                  <h3>{person.name}</h3>
                  <p>{person.departmentName || "Departamento não informado"}</p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
