import Link from "next/link";
import { DeviceSessionsPanel } from "./device-sessions-panel";

export const dynamic = "force-dynamic";

export default function DeviceSessionsAdminPage() {
  return (
    <main className="auth-page">
      <section className="auth-card admin-card">
        <p className="auth-eyebrow">CONNEXA · CONTROLE DE ACESSO</p>
        <h1>Dispositivos e sessões</h1>
        <p className="auth-description">
          Aprove dispositivos pendentes ou revogue dispositivos e sessões. Cada
          alteração exige justificativa e fica registrada na auditoria.
        </p>
        <p><Link href="/admin">Voltar à administração</Link></p>
        <DeviceSessionsPanel />
      </section>
    </main>
  );
}
