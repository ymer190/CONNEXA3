"use client";

import { useState, type FormEvent } from "react";

type AcceptInviteFormProps = {
  tokenHash: string;
};

export function AcceptInviteForm({ tokenHash }: AcceptInviteFormProps) {
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    // Remove the one-time token from the visible URL before sending it.
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
