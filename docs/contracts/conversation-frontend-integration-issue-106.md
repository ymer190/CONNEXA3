# Integração Front-end de conversas — Issue #106

**Estado:** experiência visual em desenvolvimento com adaptadores locais. Nenhuma operação abaixo é uma API existente.
**Objetivo:** permitir que a interface seja ligada a operações server-side aprovadas sem consultas diretas às tabelas.

## Camadas no cliente

- `conversationService`: listar, marcar leitura e iniciar conversa individual/em grupo.
- `messageService`: listar histórico paginado e submeter mensagem.
- `attachmentService`: preparar metadados/preview local. O adaptador atual não faz upload.
- `src/types/conversations.ts`: modelos que a interface consome; a camada de integração fará o mapeamento dos DTOs do servidor para esses tipos.

Os três serviços atuais usam exclusivamente dados simulados. Mensagens novas recebem estado `pending` e a tela informa que não foram enviadas. Nenhum serviço importa o cliente Supabase ou acessa `public.conversations`, `messages`, `conversation_members`, `message_attachments` ou `conversation_audit_logs`.

## Operações necessárias do Back-end

Os nomes HTTP/RPC ainda precisam ser definidos pelo Back-end. Abaixo estão os argumentos e respostas mínimos esperados pela experiência:

### Listar conversas

**Entrada**

```ts
{
  query?: string;
  kind?: "direct" | "group";
  unreadOnly?: boolean;
  limit: number;          // padrão 30, máximo recomendado 100
  cursor?: string | null; // opaco, estável
}
```

**Resposta**

```ts
{
  items: Array<{
    id: string;                 // UUID
    kind: "direct" | "group";
    title: string | null;
    avatarUrl: string | null;   // URL curta autorizada ou nula
    participantPreview: Array<{ id: string; displayName: string; avatarUrl: string | null }>;
    lastMessage: {
      id: string;
      preview: string;          // sanitizada conforme autorização/conteúdo
      createdAt: string;        // ISO-8601 UTC
      senderId: string | null;
      kind: "text" | "image" | "document" | "audio" | "system";
    } | null;
    unreadCount: number;        // calculada no servidor para o usuário da sessão
    updatedAt: string;
  }>;
  nextCursor: string | null;
  hasMore: boolean;
}
```

Pesquisa, filtro não lido e tipo devem ser aplicados no servidor quando houver integração; a UI pode manter pesquisa local apenas na página já carregada.

### Buscar histórico

**Entrada:** `conversationId: UUID`, `limit` (padrão 50, máximo 100) e cursor opcional `before: { createdAt: ISO-8601 UTC, id: UUID }`. Os dois campos do cursor são enviados juntos. Ordenação estável decrescente por `(createdAt,id)`; a interface pode inverter a página para renderização cronológica.

**Resposta:** `{ items: MessageDTO[], nextCursor: Cursor | null, hasMore: boolean }`. Cada mensagem precisa trazer `id`, `conversationId`, `senderId`, `senderDisplayName`, `kind`, `text` ou envelope de conteúdo aprovado, `createdAt`, `editedAt?`, `deletedAt?`, `attachments[]` e status de entrega server-side. A API não deve enviar segredo/chave de descriptografia ao cliente por este contrato. A forma de criptografia e descriptografia continua decisão do Back-end/segurança.

### Enviar mensagem

**Entrada:** `conversationId`, `clientMessageId: UUID` (idempotência), `text?` e `attachmentIds[]?`. Exigir texto ou ao menos um anexo; o autor é sempre derivado da sessão autenticada, nunca de um `senderId` fornecido pelo browser.

**Resposta:** mensagem persistida com `id`, `clientMessageId`, autor projetado, conteúdo aprovado, horário do servidor, anexos aceitos e estado `accepted`/confirmado. A UI só substitui o estado pendente por confirmado depois dessa resposta. Timeout mantém a chave idempotente para permitir repetição segura.

### Marcar leitura

**Entrada:** `conversationId`, `lastReadMessageId: UUID`.
**Resposta:** `{ conversationId, lastReadMessageId, readAt }`. O servidor valida participação e atualiza a leitura para o usuário autenticado.

### Criar conversa individual ou grupo

**Entrada:** tipo, título para grupo quando aplicável e IDs dos participantes. O backend deriva o criador da sessão e valida organização, estado de conta, bloqueios, membros, limites e permissão. Nome/ID digitados localmente no protótipo não equivalem a uma seleção autorizada do diretório.

**Resposta:** resumo normalizado compatível com o DTO de listagem. Erros devem indicar participante inexistente/inacessível ou limite inválido sem revelar dados entre organizações.

### Anexos

1. Solicitar autorização de upload com `conversationId`, nome, MIME declarado e tamanho.
2. Receber identificador de upload e credencial curta de Storage privado, limitada ao objeto/ação/tamanho e à sessão autorizada.
3. Concluir o upload e receber `attachmentId` mais status de varredura.
4. Exibir/baixar apenas por operação autorizada e URL curta. Nunca persistir URL pública, `bucket_id` ou `object_path` em estado público de interface.

Limites atuais do schema: imagem 15 MiB, áudio 25 MiB, vídeo 100 MiB e documento 50 MiB. O servidor ainda precisa validar MIME real, conteúdo, quota e malware; validação no browser é somente feedback de UX. Bucket, antivírus e fluxo de download continuam dependências.

### Atualizações em tempo real

A interface se beneficia de um canal autenticado e escopado por conversa para novos eventos, alterações de leitura e estado de entrega. O servidor deve validar participação/revogação em cada assinatura; o cliente não decide autorização. Sem esse contrato, a tela pode atualizar por revalidação periódica, mas não promete entrega instantânea.

## Erros esperados

Contrato de erro recomendado: `{ code, message, requestId? }`, sem SQL, detalhes internos ou confirmação da existência de recursos fora do escopo.

| Código estável | Comportamento esperado na UI |
|---|---|
| `AUTHENTICATION_REQUIRED` | levar ao fluxo de login |
| `FORBIDDEN` | informar falta de acesso sem mostrar conteúdo/participantes |
| `NOT_FOUND` | tratar conversa inexistente ou fora do escopo sem distinção |
| `VALIDATION_ERROR` | mostrar erro no campo, sem repetir automaticamente |
| `CURSOR_INVALID` | recarregar a página inicial |
| `ATTACHMENT_REJECTED` | manter composição e indicar motivo permitido |
| `RATE_LIMITED` | preservar rascunho e aguardar o intervalo indicado pelo servidor |
| `NETWORK_UNAVAILABLE` / timeout | manter mensagem como pendente local e oferecer nova tentativa idempotente |
| `SERVICE_UNAVAILABLE` | preservar rascunho; não indicar envio confirmado |

O mapeamento HTTP/SQLSTATE real ainda depende das RPCs/endpoints a serem publicados.

## Autorização e limites

- Toda leitura, escrita, upload e assinatura de evento é autorizada no Back-end. Papel informado por UI, filtro, ID de organização e ID de remetente não são prova de permissão.
- Os serviços do browser nunca usam `service_role` ou secret key. A integração deve usar a sessão do usuário e operações públicas com autorização server-side.
- Leitura de conversa pelo participante é distinta da consulta excepcional administrativa da #96. Papel `platform_admin` ou suporte não concede leitura automática de conteúdo. A consulta excepcional exige o grant e as aprovações definidos na ADR e deve ter contrato/API separados.
- As tabelas de conversa no DEV permanecem sem grants/policies/RPCs; esta interface não tenta contornar esse bloqueio.
- O envio mostrado nesta versão é apenas local. Ainda não existe persistência, entrega, sincronização entre usuários, nem teste de usuário diferente.

## Critérios para substituir os mocks

1. Back-end publica assinaturas, entrada/resposta, erros e autorização das operações acima.
2. Tipos dos DTOs são alinhados com o contrato aceito pelas equipes; cursor e idempotência são exercitados.
3. Upload/scan/download privado é aprovado antes de habilitar anexos.
4. Adaptadores são substituídos sem alterar os componentes, usando a sessão do usuário e sem acesso direto às tabelas.
5. Validar com dois usuários reais/autorizados: conversa individual e grupo, paginação, não lidas, falha/offline, retry idempotente e escopos diferentes.
