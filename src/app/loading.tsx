export default function Loading() {
  return (
    <main className="workspace-loading" aria-busy="true" aria-live="polite">
      <div className="workspace-loading-card">
        <span className="workspace-loading-mark" aria-hidden="true">C.</span>
        <div className="workspace-skeleton skeleton-heading" />
        <div className="workspace-skeleton skeleton-line" />
        <div className="workspace-skeleton skeleton-line short" />
        <p>Carregando seu espaço de trabalho…</p>
      </div>
    </main>
  );
}
