import "server-only";

export type EmployeeInviteEmailInput = {
  to: string;
  fullName: string;
  actionLink: string;
  idempotencyKey: string;
};

export type EmployeeInviteEmailResult =
  | { kind: "sent"; providerMessageId: string }
  | { kind: "failed" | "unknown" };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

function isSafeActionLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Server-only Resend adapter. It deliberately does not log recipient addresses,
 * action links, API responses, or provider credentials.
 *
 * The same idempotency key must be reused for retries of one provisioning
 * operation. Resend's idempotency window is provider-managed; after that window
 * the operation still requires application-side reconciliation.
 */
export async function sendEmployeeInviteWithResend(
  input: EmployeeInviteEmailInput,
): Promise<EmployeeInviteEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (
    !apiKey ||
    !from ||
    !input.to ||
    !input.fullName ||
    !isSafeActionLink(input.actionLink) ||
    !/^[\x21-\x7E]{1,256}$/.test(input.idempotencyKey)
  ) {
    return { kind: "failed" };
  }

  const safeName = escapeHtml(input.fullName);
  const safeLink = escapeHtml(input.actionLink);
  const text = [
    `Olá, ${input.fullName}.`,
    "",
    "Sua conta no CONNEXA foi criada pelo administrador da sua organização.",
    "Acesse o link abaixo para concluir seu primeiro acesso e definir sua senha:",
    input.actionLink,
    "",
    "Se você não esperava este convite, entre em contato com o administrador da sua organização.",
  ].join("\n");

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: "Seu primeiro acesso ao CONNEXA",
        html: [
          "<!doctype html>",
          '<html lang="pt-BR"><body>',
          `<p>Olá, ${safeName}.</p>`,
          "<p>Sua conta no CONNEXA foi criada pelo administrador da sua organização.</p>",
          "<p>Use o botão abaixo para concluir seu primeiro acesso e definir sua senha:</p>",
          `<p><a href="${safeLink}">Concluir primeiro acesso</a></p>`,
          "<p>Se você não esperava este convite, entre em contato com o administrador da sua organização.</p>",
          "</body></html>",
        ].join(""),
        text,
      }),
      cache: "no-store",
    });
  } catch {
    // A network failure cannot prove that the provider did not accept the email.
    return { kind: "unknown" };
  }

  if (!response.ok) {
    // Treat server errors as ambiguous; explicit client/configuration errors fail.
    return response.status >= 500
      ? { kind: "unknown" }
      : { kind: "failed" };
  }

  try {
    const result: unknown = await response.json();
    if (
      typeof result === "object" &&
      result !== null &&
      "id" in result &&
      typeof result.id === "string" &&
      result.id.length > 0
    ) {
      return { kind: "sent", providerMessageId: result.id };
    }
  } catch {
    // A successful status without a parseable receipt is an ambiguous outcome.
  }

  return { kind: "unknown" };
}
