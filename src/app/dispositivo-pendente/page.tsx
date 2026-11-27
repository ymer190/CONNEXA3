import Link from "next/link";
import { getSafeRedirectDestination } from "@/lib/auth-flow.mjs";
import { DeviceApprovalRefresh } from "./refresh-button";

type DevicePendingPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function DevicePendingPage({ searchParams }: DevicePendingPageProps) {
  const { next } = await searchParams;
  const destination = getSafeRedirectDestination(next);

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="auth-eyebrow">CONNEXA · AUTORIZAÇÃO DE DISPOSITIVO</p>
        <h1>Aguardando liberação da TI</h1>
        <p className="auth-description">
          Este navegador foi registrado para sua conta. Os recursos da plataforma
          ficam indisponíveis até que um administrador da TI aprove o dispositivo.
        </p>
        <DeviceApprovalRefresh redirectTo={destination} />
        <p className="auth-description">
          Se você já tem outro dispositivo autorizado, peça a liberação por ele.
        </p>
        <Link href="/login">Voltar ao acesso</Link>
      </section>
    </main>
  );
}
