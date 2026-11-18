"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type LoginFormProps = {
  redirectTo: string;
};

export function LoginForm({ redirectTo }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMessage("Não foi possível entrar. Verifique suas credenciais.");
        return;
      }

      router.replace(redirectTo);
      router.refresh();
    } catch {
      setErrorMessage(
        "Não foi possível conectar ao serviço de autenticação. Tente novamente.",
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
