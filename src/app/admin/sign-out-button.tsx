"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSignOut() {
    setIsSigningOut(true);
    setErrorMessage("");

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        setErrorMessage("Não foi possível encerrar sua sessão. Tente novamente.");
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch {
      setErrorMessage("Não foi possível conectar ao serviço de autenticação. Tente novamente.");
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <>
      {errorMessage ? (
        <p className="auth-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <button
        className="auth-submit"
        type="button"
        onClick={handleSignOut}
        disabled={isSigningOut}
      >
        {isSigningOut ? "Saindo..." : "Sair"}
      </button>
    </>
  );
}
