"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type LoginFormProps = {
  redirectTo: string;
};

export function LoginForm({ redirectTo }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    let supabase: ReturnType<typeof createClient> | null = null;
    let authenticated = false;
    try {
      supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMessage("Não foi possível entrar. Verifique suas credenciais.");
        return;
      }
      authenticated = true;

      const enrollment = await fetch("/api/device-sessions/register", {
        method: "POST",
        cache: "no-store",
      });
      const enrollmentResult = (await enrollment.json().catch(() => null)) as {
        status?: "approved" | "pending";
      } | null;
      if (!enrollment.ok || !enrollmentResult || !["approved", "pending"].includes(enrollmentResult.status ?? "")) {
        const wasCleared = await clearLocalSession(supabase);
        authenticated = false;
        setErrorMessage(wasCleared
          ? "Não foi possível validar este dispositivo. Sua sessão neste navegador foi encerrada; tente novamente."
          : "Não foi possível validar este dispositivo nem encerrar a sessão. O acesso continua bloqueado; tente novamente ou procure a TI.");
        return;
      }

      if (enrollmentResult.status === "pending") {
        const pendingUrl = new URL("/dispositivo-pendente", window.location.origin);
        pendingUrl.searchParams.set("next", redirectTo);
        window.location.assign(pendingUrl.toString());
        return;
      }

      // A full navigation lets the server middleware read the persisted
      // Supabase session cookies before rendering the protected destination.
      window.location.assign(redirectTo);
    } catch {
      const wasAuthenticated = authenticated;
      const wasCleared = wasAuthenticated && supabase ? await clearLocalSession(supabase) : false;
      setErrorMessage(
        wasAuthenticated
          ? wasCleared
            ? "Não foi possível validar o dispositivo por uma falha temporária. Sua sessão neste navegador foi encerrada; tente novamente."
            : "Não foi possível validar este dispositivo nem encerrar a sessão. O acesso continua bloqueado; tente novamente ou procure a TI."
          : "Não foi possível conectar ao serviço de autenticação. Tente novamente.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label htmlFor="email">E-mail</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="voce@empresa.com"
        required
      />

      <label htmlFor="password">Senha</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Sua senha"
        required
      />

      {errorMessage ? (
        <p className="auth-error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}

async function clearLocalSession(supabase: ReturnType<typeof createClient>) {
  try {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    return !error;
  } catch {
    // The protected routes still require a registered device if local cleanup fails.
    return false;
  }
}
