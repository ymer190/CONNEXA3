import Link from "next/link";
import { DeviceApprovalRefresh } from "./refresh-button";

export default function DevicePendingPage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="auth-eyebrow">CONNEXA · AUTORIZAÇÃO DE DISPOSITIVO</p>
        <h1>Aguardando liberação da TI</h1>
        <p className="auth-description">
          Este navegador foi registrado para sua conta. Os recursos da plataforma
          ficam indisponíveis até que um administrador da TI aprove o dispositivo.
        </p>
        <DeviceApprovalRefresh />
        <p className="auth-description">
          Se você já tem outro dispositivo autorizado, peça a liberação por ele.
        </p>
        <Link href="/login">Voltar ao acesso</Link>
      </section>
    </main>
  );
}
