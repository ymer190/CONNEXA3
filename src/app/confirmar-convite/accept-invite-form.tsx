"use client";

import { useState, type FormEvent } from "react";

export function AcceptInviteForm() {
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const tokenHash = fragment.get("token_hash");
    const type = fragment.get("type");

    if (!tokenHash || tokenHash.length > 512 || type !== "invite") {
      setErrorMessage("O link do convite é inválido ou está incompleto. Solicite um novo convite.");
      return;
    }

    setIsSubmitting(true);
    // The URL fragment is not sent to the server in the initial page request.
    // Remove it before making the one-time verification request.
    window.history.replaceState({}, document.title, "/confirmar-convite");

    try {
      const response = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token_hash: tokenHash }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setErrorMessage(result.error ?? "Não foi possível validar o convite.");
        return;
      }

      window.location.assign("/primeiro-acesso");
    } catch {
      setErrorMessage("Não foi possível conectar. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      {errorMessage ? (
        <p className="auth-error" role="alert">{errorMessage}</p>
      ) : null}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Validando convite..." : "Aceitar convite"}
      </button>
    </form>
  );
}
