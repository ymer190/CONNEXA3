"use client";

import { useState, type FormEvent } from "react";

export function FirstAccessForm() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (password !== confirmation) {
      setErrorMessage("As senhas informadas não são iguais.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/first-access/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setErrorMessage(
          result.error ?? "Não foi possível concluir. Tente novamente.",
        );
        return;
      }

      window.location.assign("/");
    } catch {
      setErrorMessage("Não foi possível conectar. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label htmlFor="new-password">Nova senha</label>
      <input
        id="new-password"
        name="new-password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />

      <label htmlFor="confirm-password">Confirme a nova senha</label>
      <input
        id="confirm-password"
        name="confirm-password"
        type="password"
        autoComplete="new-password"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        required
      />

      {errorMessage ? (
        <p className="auth-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Salvando..." : "Definir senha e continuar"}
      </button>
    </form>
  );
}
