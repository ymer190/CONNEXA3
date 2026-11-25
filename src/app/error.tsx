"use client";

export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="workspace-error">
      <section className="workspace-error-card" role="alert">
        <p className="module-eyebrow">CONNEXA · RECUPERAÇÃO</p>
        <h1>Não foi possível carregar esta área</h1>
        <p>Ocorreu um problema ao abrir o espaço de trabalho. Tente novamente. Se o problema continuar, procure o setor de TI.</p>
        <button type="button" onClick={() => reset()}>Tentar novamente</button>
      </section>
    </main>
  );
}
