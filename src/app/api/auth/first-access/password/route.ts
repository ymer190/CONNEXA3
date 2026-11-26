import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitação inválida." }, { status: 400 });
  }

  const password =
    typeof body === "object" && body !== null && "password" in body
      ? (body as { password?: unknown }).password
      : undefined;

  if (typeof password !== "string" || password.length < 1 || password.length > 256) {
    return NextResponse.json({ error: "Senha inválida." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Sessão inválida. Abra novamente o convite." }, { status: 401 });
  }

  if (user.app_metadata?.first_access_pending !== true) {
    return NextResponse.json({ error: "Primeiro acesso já concluído ou não aplicável." }, { status: 409 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !secretKey) {
    return NextResponse.json(
      { error: "A conclusão segura do primeiro acesso não está configurada." },
      { status: 503 },
    );
  }

  const { error: passwordError } = await supabase.auth.updateUser({ password });
  if (passwordError) {
    return NextResponse.json(
      { error: "A senha não atende à política de autenticação. Verifique e tente novamente." },
      { status: 400 },
    );
  }

  const admin = createSupabaseClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...user.app_metadata,
      first_access_pending: false,
    },
  });

  if (metadataError) {
    // Fail closed: the pending marker remains set and middleware keeps access blocked.
    return NextResponse.json(
      { error: "Senha atualizada, mas não foi possível concluir a liberação. Tente novamente." },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
