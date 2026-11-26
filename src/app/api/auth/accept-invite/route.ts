import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Origem da solicitação inválida." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitação inválida." }, { status: 400 });
  }

  const tokenHash =
    typeof body === "object" && body !== null && "token_hash" in body
      ? (body as { token_hash?: unknown }).token_hash
      : undefined;

  if (typeof tokenHash !== "string" || tokenHash.length < 1 || tokenHash.length > 512) {
    return NextResponse.json({ error: "Convite inválido." }, { status: 400 });
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "invite",
  });

  if (verifyError) {
    return NextResponse.json(
      { error: "O convite expirou ou já foi utilizado. Solicite um novo convite." },
      { status: 400 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.first_access_pending !== true) {
    await supabase.auth.signOut();
    return NextResponse.json(
      { error: "O convite não está provisionado para primeiro acesso. Solicite suporte ao administrador." },
      { status: 403 },
    );
  }

  return NextResponse.json({ ok: true });
}
