import Link from "next/link";
import { DeviceSessionsPanel } from "./device-sessions-panel";

export const dynamic = "force-dynamic";

type DeviceSessionsAdminPageProps = {
  searchParams: Promise<{ error?: string; updated?: string }>;
};

const errorMessages: Record<string, string> = {
  validation: "Confira o identificador e a justificativa informados.",
  forbidden: "Sua conta não tem autorização para concluir essa operação.",
  action: "A operação não foi concluída. Revise o estado atual e tente novamente.",
  unavailable: "O serviço de dispositivos está indisponível. Tente novamente em alguns instantes.",
};

export default async function DeviceSessionsAdminPage({ searchParams }: DeviceSessionsAdminPageProps) {
  const { error, updated } = await searchParams;

  return (
    <main className="auth-page">
      <section className="auth-card admin-card">
        <p className="auth-eyebrow">CONNEXA · CONTROLE DE ACESSO</p>
        <h1>Dispositivos e sessões</h1>
        <p className="auth-description">
          Aprove dispositivos pendentes ou revogue dispositivos e sessões. Cada
          alteração exige justificativa e fica registrada na auditoria.
        </p>
        <p className="auth-description">
          A aprovação utiliza a assinatura RPC atualmente disponível no Supabase DEV. Os controles avançados que exigem chamado ativo permanecem adiados.
        </p>
        <p><Link href="/admin">Voltar à administração</Link></p>
        {error && errorMessages[error] ? <p role="alert">{errorMessages[error]}</p> : null}
        {updated === "1" ? <p role="status">A operação foi registrada na auditoria.</p> : null}
        <DeviceSessionsPanel />
      </section>
    </main>
  );
}
