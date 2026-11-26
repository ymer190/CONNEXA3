import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Creates a privileged Supabase client for trusted server-side workflows only.
 *
 * Never import this module from Client Components or expose SUPABASE_SECRET_KEY
 * through a NEXT_PUBLIC_ environment variable.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error(
      "A configuração administrativa do Supabase não está disponível no servidor.",
    );
  }

  return createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
