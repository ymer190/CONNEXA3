"use client";

import { useState, useTransition, type FormEvent } from "react";
import { approveDevice, listDeviceSessions, revokeDevice, revokeSession } from "./actions";

type DeviceSession = {
  user_id: string;
  device_id: string;
  session_id: string;
  device_label: string;
  user_agent: string | null;
  device_status: "pending" | "approved" | "revoked";
  session_status: "pending" | "approved" | "revoked";
  requested_at: string;
  last_seen_at: string;
};

export function DeviceSessionsPanel() {
  const [rows, setRows] = useState<DeviceSession[] | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function loadSessions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await listDeviceSessions(formData);
      if ("error" in result && typeof result.error === "string") {
        setMessage(result.error);
        setRows(null);
        return;
      }
      if (!("rows" in result) || !Array.isArray(result.rows)) {
        setMessage("Não foi possível consultar as sessões.");
        setRows(null);
        return;
      }
      setRows(result.rows as DeviceSession[]);
      setMessage("Consulta registrada na auditoria.");
    });
  }

  return (
    <section aria-label="Sessões cadastradas">
      <form onSubmit={loadSessions} className="device-session-action">
        <label>Justificativa da consulta
          <input name="justification" required maxLength={500} />
        </label>
        <button type="submit" disabled={pending}>{pending ? "Consultando…" : "Consultar sessões"}</button>
      </form>
      {message ? <p role="status">{message}</p> : null}
      {rows?.length === 0 ? <p>Nenhuma sessão registrada.</p> : null}
      {rows && rows.length > 0 ? (
        <div className="device-session-list">
          {rows.map((row) => (
            <article className="device-session-card" key={row.session_id}>
              <h2>{row.device_label}</h2>
              <dl>
                <div><dt>Usuário</dt><dd>{row.user_id}</dd></div>
                <div><dt>Dispositivo</dt><dd>{row.device_id}</dd></div>
                <div><dt>Sessão</dt><dd>{row.session_id}</dd></div>
                <div><dt>Estado do dispositivo</dt><dd>{row.device_status}</dd></div>
                <div><dt>Estado da sessão</dt><dd>{row.session_status}</dd></div>
                <div><dt>Último acesso</dt><dd>{new Date(row.last_seen_at).toLocaleString("pt-BR")}</dd></div>
                <div><dt>Navegador informado</dt><dd>{row.user_agent ?? "Não informado"}</dd></div>
              </dl>
              {row.device_status === "pending" ? (
                <form action={approveDevice} className="device-session-action">
                  <input type="hidden" name="target" value={row.device_id} />
                  <label>Referência do chamado<input name="ticket_reference" required maxLength={80} /></label>
                  <label>Justificativa<input name="justification" required maxLength={500} /></label>
                  <button type="submit">Liberar dispositivo</button>
                </form>
              ) : null}
              {row.device_status !== "revoked" ? (
                <div className="device-session-actions">
                  <form action={revokeSession} className="device-session-action">
                    <input type="hidden" name="target" value={row.session_id} />
                    <label>Justificativa<input name="justification" required maxLength={500} /></label>
                    <button type="submit">Revogar sessão</button>
                  </form>
                  <form action={revokeDevice} className="device-session-action">
                    <input type="hidden" name="target" value={row.device_id} />
                    <label>Justificativa<input name="justification" required maxLength={500} /></label>
                    <button type="submit">Revogar dispositivo</button>
                  </form>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
