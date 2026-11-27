"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function DeviceApprovalRefresh({ redirectTo }: { redirectTo: string }) {
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);

  async function checkApproval() {
    setChecking(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("device_session_is_authorized");
      if (error) {
        setMessage("Não foi possível consultar a autorização agora.");
      } else if (data) {
        window.location.assign(redirectTo);
        return;
      } else {
        setMessage("A autorização ainda está pendente.");
      }
    } catch {
      setMessage("Não foi possível consultar a autorização agora.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={checkApproval} disabled={checking}>
        {checking ? "Consultando…" : "Verificar autorização"}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
