# Issue #96 — Authorization and permissions design

Status: business decisions for role boundaries, department-scoped manager capabilities, conversation types and privacy boundaries are approved. Executable capability assignments, the final physical schema, RLS policies, encryption envelope, and operational workflows remain implementation work and must respect the dependency gates documented below.

## 1. Purpose

Define a least-privilege authorization model for CONNEXA3. Every protected operation must be authorized on the server and, where data access is involved, enforced again by PostgreSQL Row Level Security (RLS). UI visibility is never a security boundary.

This document records the agreed privacy boundary and the remaining business decisions for exceptional conversation access. It does not authorize production changes or grant permissions by itself.

## 2. Verified DEV baseline

- Supabase Auth is integrated through `@supabase/ssr`.
- The server-side client uses the public/publishable key and the authenticated session.
- `public.platform_users` currently contains only the `platform_admin` role.
- At the time of inspection, `connexa-dev` contained one `platform_admin` row. The current baseline and product-owner clarification establish that one platform administrator has been created; they do not establish that this account is approved for exceptional conversation-content access.
- RLS is enabled on the four existing public tables: `organizations`, `profiles`, `organization_members`, and `platform_users`.
- Authenticated users can read only their own `platform_users` row.
- The current middleware and admin page check membership in `platform_users` for the `/admin` route.
- The current DEV database has no application tables for conversations, departments, or groups. Policies for those resources cannot yet be safely implemented against the current schema.
- The legacy `owner/admin/member` organization roles are not the approved role model for platform authorization.

## 2.1 Product-owner-approved authorization categories

The product owner approved the following high-level structure for Issue #96:

- `platform_admin`: platform-level IT administration and governance. This role does not grant routine or automatic access to conversation content.
- `it_support`: operational IT support, limited to consulting registered devices and sessions and revoking devices/sessions when needed for security or support. Access is restricted to users belonging to the organization associated with the support request being handled; the support role does not grant cross-organization or unrestricted tenant access. The target organization and users must be validated server-side for each operation. Every operation requires an active, identified support ticket and a non-empty justification. Device/session consultations and revocations must be audited; revocation is limited to devices and sessions belonging to the user covered by that ticket. No operation may proceed outside the ticket's organization or target-user scope. It has no routine conversation-content access, cannot change platform or organization roles, cannot administer organizations, and cannot consult the complete administrative audit history.
- `collaborator`: the standard organization user category. A collaborator who manages a department receives additional capabilities scoped only to the department(s) assigned to them; department management does not turn that person into a global/platform administrator.

A department manager is therefore not a separate global platform role. Department-manager authority is represented by department-scoped capabilities assigned explicitly to a collaborator. The product owner approved that a department manager may consult information about their own department, manage membership of their own department, and create/administer groups linked to their own department. They must not access other departments, administer organizations, or manage global permissions. These capabilities are scoped to the department(s) assigned to the collaborator; they do not create cross-department or platform-wide authority.

## 3. Authorization principles

1. Deny by default. Missing identity, missing role, missing permission, invalid scope, or authorization lookup errors result in denial.
2. Derive identity from the validated Supabase Auth session (`auth.uid()` in database policies). Never trust user-supplied IDs, role fields, headers, or editable metadata as proof of authority.
3. Enforce permissions in server-side operations and in RLS. Middleware and UI checks are supplementary, not sufficient.
4. Separate role assignment from ordinary user capabilities. A user must not be able to grant or elevate their own role.
5. Apply explicit resource scope to every decision (for example, department, group, conversation, or device) once those entities and relationships are defined.
6. Keep privileged credentials server-side only. Do not expose service-role credentials to the browser.
7. Do not deploy schema or authorization changes to PROD as part of this proposal.

## 4. Agreed privacy boundary — exceptional conversation access

The product owner approved the following rule for Issue #96:

- No administrator, including `platform_admin`, receives routine or automatic access to conversation content.
- The operational IT team must not receive direct access to conversation content as part of ordinary support duties.
- Exceptional conversation-content access is permitted only when explicitly approved by the business for a specifically designated identity or role, and granted through a separate capability. The currently existing `platform_admin` account is not automatically eligible; its eligibility has not been approved.
- **Approval and revocation authority:** only the formally designated **Responsible for Privacy and Data Governance (RPGD)**, independent of the operational IT team, may approve or revoke exceptional conversation-content access. The RPGD is a business governance function designated by organizational leadership, not a new global platform role. Operational IT personnel cannot approve, grant, or revoke this capability for themselves or others.
- The RPGD may approve a specific identity or role for a defined scope and validity period, with a documented justification. Approval does not itself provide the RPGD with access to conversation content. The authorized identity must separately hold the explicit, time-bounded `conversations.exceptional_read` capability. Grants must expire automatically unless explicitly renewed; revocation must take effect promptly and be audited.
- The RPGD must not be assigned to a member of the operational IT team. The product owner approved that the RPGD is formally appointed and replaced by a documented decision of organizational leadership. The named individual and detailed administrative procedure remain for leadership to define later; no person or account is designated by this technical decision. Its designation, changes, approvals, renewals, and revocations must be auditable.
- General platform administration does not implicitly grant conversation-content access. The exceptional permission must be distinct, independently checked, explicitly granted, and revocable.
- Every exceptional consultation requires a non-empty justification.
- Authorization and scope must be validated server-side before any conversation content is returned.
- Each consultation must be audited with at least administrator identity, justification, conversation/resource scope, and timestamp.
- Audit persistence must succeed before content is disclosed; if the audit write fails, access must fail closed.
- No individual notification is sent to the collaborator at the moment of consultation, as previously directed by the product owner; this behavior should be reconfirmed with the broader privacy policy before implementation.
- Ordinary authenticated clients must not be able to insert, update, or delete audit records.
- Complete administrative audit-history access (`audit.read`) is restricted to `platform_admin`; `it_support` cannot consult the complete administrative audit history. The RPGD may consult only the audit records strictly necessary to oversee exceptional-access approvals, renewals, revocations, and consultations; this scoped oversight does not grant general `audit.read` or conversation-content access.
- Audit events cover permission grants/revocations, role changes, administrative operations, support device/session actions, and exceptional conversation consultations.
- Audit records must include, as applicable: actor identity, action, target/resource, organization scope, timestamp, outcome, correlation identifier, and a non-empty justification for actions that require one.
- Audit records must never contain conversation message bodies, attachment contents, passwords, access tokens, or credentials. Sensitive fields must be minimized and masked where applicable.
- Ordinary authenticated clients cannot insert, update, or delete audit records. Audit records are append-only to application actors; privileged maintenance must be separately controlled and audited.
- Standard retention is **12 months**. A longer preservation period is permitted only for a documented legal obligation, investigation, or formal preservation hold. Retention must be reviewed periodically; at expiry, records must be securely deleted or anonymized when legally permitted.

The RPGD designation (including the leadership decision appointing or replacing the function holder), eligible identities, approval/revocation records, approved scope, validity period, and capability lifecycle must be represented through controlled authorization data and audited administrative operations. The person's name and detailed administrative procedure are intentionally deferred to organizational leadership. Do not hardcode user IDs in policies, infer eligibility from the number of rows, or trust client-editable metadata.

## 4.1 Product-owner-approved conversation data model

The product owner approved a unified conversation model as the architectural basis for conversation resources. The model uses shared entities rather than separate message-storage implementations for each conversation type:

- `conversations`: canonical conversation record and its type.
- `conversation_members`: participants and their conversation-scoped membership/permissions.
- `messages`: messages belonging to a conversation.
- `message_attachments`: attachment metadata and references to stored objects; access to the underlying object must be authorized against the parent conversation and message.
- `conversation_audit_logs`: conversation-domain events, such as conversation creation/archival, participant join/leave/removal, and conversation-scoped membership changes. It follows the approved audit governance, retention, and data-minimization rules and never stores message bodies or attachment contents. It is not the source of truth for platform-wide administrative/security actions owned by Issue #97.

The approved conversation types are:

- `channel`: organization channel, supporting the already-established public/private channel distinction.
- `direct`: private conversation between two people. **There may be only one active direct conversation per unordered pair of users.** When either user starts a direct conversation with the other, the application must reuse the existing active conversation rather than create a duplicate. The pair is order-independent (A–B is the same pair as B–A).
- `group`: private conversation among multiple people.

**Group participant removal (approved):** when a participant is removed from a group, their access to the group is revoked immediately, including access to messages and attachments/files in that group. The group's message history is retained for the remaining authorized participants; removal does not delete the conversation or its history. If the person is later added again, re-entry requires a new explicit authorization/invitation. A previous membership does not restore access by itself.

**Message editing and deletion (approved):** a message author may edit their own messages. Edited messages must be visibly identified as edited. A message author may delete their own messages; deletion is represented to conversation participants by a “Message deleted” placeholder rather than silently removing the message from the conversation timeline. Administrative roles, including `platform_admin`, do not by themselves authorize editing or deleting another user's messages. These permissions must be enforced server-side and by RLS, not only by the client UI.

**Group/channel lifecycle (approved):** authorized actors may rename a group or channel only when they have the relevant management permission for that specific conversation. Authorized actors may archive a group or channel; archiving prevents new messages while preserving the conversation history for consultation by participants who remain authorized. Conversations must not be physically deleted as a normal user/admin operation; archival is the supported lifecycle action, preserving history and auditability. Authorization is enforced server-side and by RLS, not only in the client UI.

**Message types and system events (approved):** the shared `messages` table stores both user-authored messages and system-generated timeline events. The initial `message_type` allowlist is `text`, `image`, `video`, `audio`, `document`, and `system`. System events include participant joins/leaves/removals and group-name changes. They are generated only by trusted server-side operations; ordinary clients cannot create or alter them. System events are not editable or deletable by ordinary users. The event should be represented with a stable event key and structured, minimized metadata so the client renders a controlled presentation rather than trusting arbitrary client-supplied system text. Attachment types continue to use the approved private-storage and validation rules.



**User blocking (approved):** a user may block another user. While the block is active, new direct messages and direct calls between the two users must be prevented. Blocking does not automatically delete the pre-existing direct-conversation history. This rule applies to direct communication; it does not, by itself, remove either person from shared groups or channels, nor does it define access to shared spaces.

**Block lifecycle (approved):** the pre-existing direct-conversation history remains available to both users while the block is active. The block prevents new direct messages and direct calls in both directions for as long as it remains active. If the blocker later unblocks the other user, direct communication may resume in the existing conversation; do not create a duplicate direct conversation. Blocking does not automatically remove either user from shared groups or channels.

**Block privacy and notifications (approved):** do not send an explicit notification to the blocked user saying that they were blocked. The application must enforce the direct-message and direct-call restriction without disclosing the blocking action to the other user. This does not prevent ordinary notifications unrelated to revealing the block, subject to the general notification policy.

**Active direct calls when a block is created (approved):** if a direct call is already active when either participant blocks the other, terminate the call immediately for both participants. Do not send an explicit block notification or a reason that reveals the block. This rule applies to direct calls only and does not automatically remove either participant from shared groups or channels.

**Blocked direct-call attempts (approved):** while a block is active, a direct-call attempt between the two users must not establish a call. The caller sees only the generic message “Não foi possível completar a chamada”, without any indication that a block exists or that the other user blocked them. Do not send an explicit block notification or disclose the blocking action.

**Account deactivation and reactivation (approved):** when an organization deactivates a user's account, that user cannot authenticate or access conversations, send messages, or initiate calls while the account remains inactive. Existing conversation history is preserved; other participants retain access according to their own current permissions. Deactivation does not delete conversations or messages. If the account is reactivated, access is restored only according to the user's current organization membership and conversation permissions; any still-active user block continues to prevent direct messages and direct calls. Reactivation must reuse existing direct conversations rather than create duplicates.

**Attachments and files (approved):** support image, video, audio, and document attachments with these maximum sizes per file: images **15 MB**, audio **25 MB**, videos **100 MB**, and documents **50 MB**. Enforce limits on the server, not only in the client. Validate the actual file type using its content/signature (not only the supplied filename or MIME header) against an explicit allowlist of supported formats; reject mismatches and unsupported formats. Run malware/content scanning before making an uploaded file available to conversation participants; files awaiting validation must remain quarantined/inaccessible, and failed or unavailable scanning must fail closed. Store file objects in private Supabase Storage buckets; do not expose public buckets or permanent public links. Every upload, preview, and download must be authorized server-side against the user's current participation in the parent conversation, with the applicable organization scope enforced. Access to an attachment follows the parent conversation's access rules. When a participant is removed from a group, their access to that group's files is revoked as well as their access to its messages. Use access-controlled, short-lived delivery (for example, signed URLs issued only after authorization) rather than permanent public URLs. File objects and metadata must not be exposed to nonparticipants. **Attachment retention and deletion lifecycle (approved):** an attachment remains stored while its parent message exists. When a message is deleted, the attachment becomes inaccessible immediately, even though physical object deletion is deferred for a 30-day safety period. After that period, the object is permanently deleted unless a documented legal obligation, investigation, or formal preservation hold requires retention. Orphaned objects with no valid message association must be detected and removed automatically. Any preservation hold must be documented, access-controlled, periodically reviewed, and lifted when its basis ends; deletion must then proceed. This lifecycle applies to object storage and associated metadata, with access revoked immediately on message deletion.

All types share the same conversation, membership, message, and attachment foundations. Organization/tenant scope must be explicit for organization-owned conversations and validated server-side. Normal content access is based on valid participation/membership and the applicable channel visibility/join rules; administrative role alone never grants read access. Exceptional access remains a separate, explicitly approved, time-bounded `conversations.exceptional_read` capability with scope, justification, pre-disclosure audit persistence, and fail-closed behavior.

This approval establishes the architectural entities and conversation categories, not the final column-level schema or every membership lifecycle rule. Detailed decisions still required before migrations include attachment retention/deletion lifecycle and exact RLS predicates. The approved file-size limits, server-side content/signature validation, allowlist requirement, and malware-scanning/quarantine gate are defined above. The private Supabase Storage, conversation-scoped authorization, no-public-link, and access-revocation rules for attachments are approved, as are the one-active-direct-conversation-per-user-pair/reuse, group participant removal/re-entry, and message editing/deletion rules. Do not infer these details or deploy a schema until they are specified and reviewed.

### 4.1.1 Public and private channel discovery and participation

The product owner approved the following initial channel-entry rules:

- **Public channels:** any active member of the owning organization may discover the channel and explicitly join it without an invitation. Discovery and joining remain organization-scoped; users from another organization must be denied.
- **Private channels:** the channel is not discoverable to non-participants. Access requires an explicit invitation or an explicit addition by an authorized participant/manager under the channel's applicable management rules. Merely being an organization member, department manager, or platform administrator does not grant access.
- In both cases, message access is governed by valid conversation membership and server-side/RLS checks. After joining a public channel, an active member of the owning organization may read the channel's available message history, including messages created before that member joined. This historical visibility is limited to the public channel and does not grant access to private-channel history or content outside the member's organization. Private-channel history remains restricted to authorized participants.
- **Voluntary departure from a public channel (approved):** a participant may leave a public channel voluntarily. Leaving immediately revokes their access to that channel's messages and attachments, including its historical content. Because the channel is public, the same active organization member may explicitly join again at any time without an invitation; rejoining restores access to the available channel history, including messages created before re-entry. Re-entry must occur through the explicit join operation and must not preserve access during the period away.
- **Private-channel creator:** the creator is automatically added as a participant when the private channel is created. This membership is created atomically with the channel so the creator can immediately access and administer its content under the same participant-based access rules. Administrative role alone remains insufficient; access follows the explicit membership record.

These rules define the initial product behavior, not the final database schema or RLS predicates. Implement only after the remaining details are reviewed.



### 4.1.3 Proposed physical conversation schema (review draft)

**Status: technical proposal, not yet approved for migration.** This section translates the approved conversation behavior into a proposed relational structure. It must be reconciled with the department/group schema from Issue #95 and account lifecycle from Issue #94 before implementation. It does not change the existing DEV database.

#### A. `conversations` — canonical conversation

Proposed columns:
- `id uuid primary key`
- `organization_id uuid not null` — tenant boundary; composite foreign keys should preserve same-organization relationships.
- `type text not null` — allow only `channel`, `direct`, `group`.
- `title text null` — required for channels/groups as applicable; not used to identify direct pairs.
- `visibility text null` — `public` or `private` only when `type = 'channel'`; null for direct/group.
- `department_id uuid null` — optional relationship to the department model from Issue #95 for department-linked groups/channels; must reference a department in the same organization.
- `created_by uuid not null` — references the creator's profile and must be an active organization member at creation.
- `status text not null` — proposed values `active`, `archived`; archived conversations are not used as the active direct conversation for new starts.
- `direct_user_low uuid null`, `direct_user_high uuid null` — populated only for direct conversations; store the two distinct user IDs in deterministic sorted order.
- `created_at timestamptz not null`, `updated_at timestamptz not null`, `archived_at timestamptz null`.

Constraints/indexes:
- CHECK constraints enforce valid `type`, `status`, and type-specific nullability: channel requires visibility; direct requires both sorted, distinct direct-user IDs and no channel visibility; group requires no direct-pair columns and no channel visibility.
- Composite unique key `(id, organization_id)` supports same-tenant foreign keys from child tables.
- Partial unique index on `(organization_id, direct_user_low, direct_user_high)` for `type = 'direct' AND status = 'active'` enforces one active direct conversation per unordered pair.
- The application normalizes the pair before insert and, on uniqueness conflict, retrieves/reuses the existing active direct conversation. Do not rely on a read-before-write check alone; the unique index is the concurrency-safe guarantee.
- `department_id` is optional because not every corporate conversation must belong to a department. If present, the department must belong to the same organization; exact FK depends on Issue #95's final department schema.

#### B. `conversation_members` — explicit participation and lifecycle

Proposed columns:
- `id uuid primary key`
- `organization_id uuid not null`
- `conversation_id uuid not null`
- `user_id uuid not null`
- `status text not null` — proposed values `active`, `removed`, `left`, `invited`.
- `added_by uuid null` — actor who invited/added the participant.
- `joined_at timestamptz null`, `removed_at timestamptz null`, `created_at timestamptz not null`, `updated_at timestamptz not null`.

Constraints/indexes:
- Foreign key `(conversation_id, organization_id)` references `conversations(id, organization_id)`.
- Organization membership must be validated against `organization_members` and its active status. A composite unique key on `organization_members(organization_id, user_id)` may be added as a redundant candidate key if needed for declarative same-tenant FKs; the existing global uniqueness of `user_id` must be preserved unless a separately approved product change replaces the one-organization-per-user rule.
- Partial unique index on `(conversation_id, user_id)` where `status = 'active'` prevents duplicate active memberships while preserving lifecycle history.
- Index `(user_id, status, conversation_id)` supports listing a user's active conversations; index `(conversation_id, status)` supports participant checks and roster queries.
- Direct conversations must have exactly two active participants matching the normalized pair stored on `conversations`. Enforce this through a trusted transactional creation/membership operation and integrity tests; ordinary clients cannot write membership rows directly.
- A removed participant does not regain access by history alone. Re-entry is a new explicit authorization event and must be recorded; prior membership history is retained.

#### C. `messages` — shared message timeline

Proposed columns:
- `id uuid primary key`
- `organization_id uuid not null`, `conversation_id uuid not null`
- `sender_id uuid null` — required for user-authored messages; null for system-generated events.
- `encrypted_payload jsonb null` — conceptual placeholder for the versioned authenticated-encryption envelope defined by the final ADR-001. It must never contain plaintext; its exact fields and nullability remain subject to ADR-001 approval. On soft deletion, revoke attachment access and apply the approved deletion behavior without copying message bodies to audit records. System-event presentation is rendered from a controlled event key and minimized structured metadata, not arbitrary client text.
- `message_type text not null` — allow only `text`, `image`, `video`, `audio`, `document`, `system`.
- `system_event_key text null` and `system_event_metadata jsonb null` — populated only for `system` events; metadata is minimized and validated by the trusted operation.
- `created_at timestamptz not null`, `updated_at timestamptz not null`, `edited_at timestamptz null`
- `deleted_at timestamptz null`, `deleted_by uuid null`.

Constraints/indexes:
- Composite FK `(conversation_id, organization_id)` references the parent conversation.
- For user-authored types (`text`, `image`, `video`, `audio`, `document`), sender must be an active participant at send time and an active member of the same organization; enforce through the trusted send operation and RLS. For `system`, `sender_id` is null, a valid `system_event_key` is required, and creation is restricted to trusted server-side operations. CHECK constraints must enforce the type-specific nullability/required fields.
- Index `(conversation_id, created_at, id)` for stable chronological pagination; index `(sender_id, created_at)` for author-scoped operations.
- Message edit is an UPDATE restricted to its author and approved editable fields. Message deletion is a controlled soft-delete; content is cleared and the UI renders the approved “Message deleted” placeholder. Ordinary clients cannot physically DELETE rows or alter sender/tenant/parent identifiers.

#### D. `message_attachments` — private object metadata

Proposed columns:
- `id uuid primary key`
- `organization_id uuid not null`, `conversation_id uuid not null`, `message_id uuid not null`
- `uploaded_by uuid not null`
- `bucket_id text not null`, `object_path text not null` — references a private Storage object, never a public URL.
- **Storage layout (approved logical pattern):** use private-only storage areas for quarantine and approved delivery. Object keys are based on internal identifiers, following the logical pattern `organizations/{organization_id}/conversations/{conversation_id}/messages/{message_id}/{attachment_id}`; do not include usernames, email addresses, or user-provided filenames in object keys. Keep the original filename only as protected metadata. Exact physical bucket names and provider configuration remain an implementation detail to settle before upload is built.
- `original_filename text not null`, `detected_mime_type text not null`, `file_category text not null`, `size_bytes bigint not null`.
- `scan_status text not null` — proposed values `quarantined`, `clean`, `rejected`, `pending_deletion`, `deleted`.
- `created_at timestamptz not null`, `deleted_at timestamptz null`, `purge_after timestamptz null`.

Constraints/indexes:
- Composite FK to the parent message/conversation/organization; add a unique key on `messages(id, conversation_id, organization_id)` to support this relationship.
- CHECK `size_bytes > 0`; enforce category-specific maximums on the server and recheck actual file signature/content before marking clean.
- Unique `(bucket_id, object_path)`; no permanent signed/public URL is stored.
- Index `(message_id)` and `(scan_status, purge_after)` for access checks and cleanup.
- Only `clean` attachments belonging to a non-deleted message can be delivered. Message deletion revokes access immediately and sets a 30-day physical deletion deadline, unless a documented hold applies. Storage authorization must resolve the object to this row and its parent conversation on every new delivery authorization.
- **Upload and release flow (approved):** upload into a private quarantine area; keep the object inaccessible to participants while server-side size, actual file signature/type, allowlist, and malware/content checks run. Only a successful scan and validation may transition the attachment to `clean` and make it eligible for authorized delivery. Rejection, scanner failure, timeout, or scanner unavailability keeps the file inaccessible (fail closed); rejected objects follow controlled cleanup. Use short-lived access-controlled delivery issued only after current membership and organization checks. The scanning provider/product and exact bucket names are not selected by this decision and must be validated before implementation.

#### E. `conversation_audit_logs` — conversation security events

Proposed columns:
- `id uuid primary key`
- `organization_id uuid not null`, `conversation_id uuid null`
- `actor_id uuid null`, `target_user_id uuid null`
- `event_type text not null`, `outcome text not null`
- `justification text null`, `correlation_id uuid not null`
- `metadata jsonb not null default '{}'` — allowlisted, minimized event attributes only; never message bodies, attachment contents, tokens, or credentials.
- `created_at timestamptz not null`.

Constraints/indexes:
- Index `(organization_id, created_at)`, `(conversation_id, created_at)`, and `(actor_id, created_at)`.
- Application actors have no direct UPDATE/DELETE; clients have no direct INSERT. Trusted server operations append events. The general audit retention/visibility rules in section 4 apply.
- **Event ownership:** `conversation_audit_logs` is authoritative for conversation-domain lifecycle and membership events (create/archive/rename, join/leave/remove, and conversation-scoped participant changes). The general audit model from Issue #97 is authoritative for platform/organization administration and security operations (role/capability changes, support-ticket/device/session actions, exceptional-access grants/revocations/consultations, and administrative governance). Do not write the same event independently to both tables. When one operation has both a conversation-domain effect and a platform/security effect, each store may record only its own distinct event, linked by the same `correlation_id` (or equivalent stable operation identifier); neither record copies the other's payload. Both stores remain append-only for application actors and follow the shared retention, minimization, and access-governance rules.

#### F. `user_blocks` — direct communication restriction

Proposed columns:
- `id uuid primary key`, `blocker_user_id uuid not null`, `blocked_user_id uuid not null`, `created_at timestamptz not null`, `revoked_at timestamptz null`.
- CHECK prevents self-blocking; unique active pair (blocker, blocked) prevents duplicate active blocks.
- Index active blocks in both lookup directions. A direct-message/call operation must check both directions; block status must not reveal the blocking user to the blocked user.
- Blocking prevents new direct messages and calls and terminates an already active direct call as approved. It does not revoke access to existing direct-message history or automatically remove either user from shared groups/channels.

#### G. Transaction boundaries and invariants

- Create a conversation and its initial membership rows in one database transaction. A private channel creator must be enrolled as an active participant in that same transaction; any membership failure rolls back the conversation.
- Direct-conversation creation normalizes the pair, checks active blocks in both directions, attempts creation, and handles the unique-index conflict by returning the existing active conversation. The operation must be concurrency-safe.
- Message creation, edit, soft-delete, participant changes, and exceptional access must use trusted server-side operations with RLS as defense in depth. Do not grant ordinary authenticated clients unrestricted direct writes to membership or authorization tables.
- Cross-tenant relationships must be prevented declaratively where possible with composite foreign keys, and otherwise validated by the trusted transaction. Never trust a client-supplied `organization_id`.
- Realtime subscriptions must apply the same authorization boundary; database row visibility and channel subscription authorization are both required.

#### H. Explicitly outside this schema slice

- Department and department-membership tables are owned by Issue #95; this model references a future `departments` table only through optional `department_id`.
- Account activation/deactivation source of truth must align with Issue #94; the conversation model must consume that trusted state rather than invent a parallel account status.
- General administrative audit and device/session entities remain in Issue #97.
- Call sessions, signaling, media/SFU metadata, read receipts, reactions, typing indicators, and message delivery/read receipts require separate requirements and are not silently introduced by this proposal.
- The existing `organization_members.role` check constraint (`owner/admin/member`) is legacy and must not be used to authorize the new conversation capabilities. Do not change it as part of this schema proposal.

#### I. Decisions still required before executable migrations

1. Reconcile the department FK with the final Issue #95 schema and account-active checks with Issue #94.
2. Select and validate the malware/content-scanning provider and finalize physical bucket names, policies, and operational integration before implementing attachment upload.

### 4.1.2 RLS authorization contract (approved technical baseline)

The following rules define the mandatory authorization contract for the future conversation schema. They are logical predicates and operation boundaries, not executable SQL: the final SQL must be written only after the column-level schema, foreign keys, indexes, constraints, and mutation workflows are reviewed.

**Global enforcement**
- Enable RLS on every exposed table in the conversation, membership, message, attachment, authorization, and audit domains. Grant only the minimum table privileges needed for each operation; RLS does not replace SQL privileges.
- Policies target `authenticated` and derive the actor from `(select auth.uid())`. A valid authenticated role alone never grants access to another user's rows.
- Every authorization decision checks current active account status and current active organization membership from trusted database records. Do not rely on stale JWT claims for deactivation, blocking, membership removal, or time-bounded exceptional grants.
- Do not authorize from client-editable `user_metadata`, request-body role fields, caller-supplied organization IDs, or the legacy `organization_members.role` values. Use controlled database-managed role/capability assignments and validate resource ownership/scope through foreign-key relationships.
- UPDATE policies must include both `USING` and `WITH CHECK`. Protect immutable ownership/tenant/author columns with column-level grants and/or server-side constraints; an RLS predicate alone is not a substitute for immutable-field protection.
- Any authorization lookup error, missing relationship, expired membership/grant, invalid scope, or unavailable dependency denies access. No permissive fallback.
- Views that expose protected data must use `security_invoker = true` where supported; otherwise deny access to ordinary client roles or move them to a non-exposed schema. Avoid functions that bypass RLS. Any genuinely required privileged function must be narrowly scoped, unavailable to `PUBLIC`, validate `auth.uid()` and resource scope internally, and be independently reviewed.

**Resource read rules**
- `conversations`: a user may read a direct or group conversation only while holding an active membership record and active organization/account status. A public channel may be discoverable to active members of its owning organization as metadata, but its messages/history are readable only after the user explicitly joins and has an active participant record. A private channel is not discoverable to nonparticipants and is readable only by active participants.
- `conversation_members`: a user may read their own membership row. The participant roster for a conversation may be read only by an active participant of that same conversation, subject to the approved privacy rules. Users cannot create, reactivate, or alter their own membership through direct table writes.
- `messages`: SELECT requires current access to the parent conversation under the rules above. Historical messages in a public channel become readable after explicit join, including messages created before joining. Removal from a group or channel revokes subsequent reads immediately.
- `message_attachments` and Storage objects: read, preview, and download require current access to the parent message and conversation, active organization/account status, and a non-deleted message. A private object bucket is mandatory. Object identifiers, metadata, or signed URLs must not provide an alternate route around the parent-conversation authorization check. Signed URLs must be short-lived and issued only after authorization; revocation must prevent new URL issuance immediately.
- `conversation_audit_logs` and general audit records: ordinary authenticated clients receive no INSERT, UPDATE, or DELETE privileges. Read access is separately scoped to the approved audit capabilities; the RPGD sees only exceptional-access lifecycle oversight records, while full administrative audit history remains restricted to `platform_admin`.

**Mutation rules**
- Conversation creation and initial membership enrollment are one atomic server-authorized operation. Private-channel creator enrollment is mandatory; if enrollment fails, the channel creation transaction fails. Public channel join and private invitation/addition are explicit, validated operations.
- Message INSERT for user-authored types requires the authenticated actor to be the sender, a currently active participant, and authorized for the parent conversation. Direct-message creation additionally checks that neither direction of the user pair is blocked. Inactive accounts cannot send.
- `system` message INSERT is denied to ordinary authenticated clients and is available only through narrowly scoped trusted server-side operations that validate the event and its resource scope. System messages cannot be edited or deleted through ordinary client operations.
- Message UPDATE is limited to the author of that message, while the message is not deleted. The update must preserve message ID, author, organization, and parent conversation; only approved editable content fields may change. Edited state/time is set by trusted server logic.
- Message deletion is a controlled soft-delete operation by the author. It replaces visible content with the approved deleted-message placeholder, revokes attachment access immediately, and schedules physical object deletion after the approved 30-day period (subject to a documented hold). Ordinary clients must not physically DELETE message or attachment rows.
- Group/channel membership changes are performed only through authorized server operations. Removal deactivates/revokes membership immediately; a later re-entry requires a new explicit authorization and must not revive the prior membership automatically.
- Client roles cannot write role/capability assignments, exceptional-access grants, audit records, or preservation holds directly. Those changes use controlled administrative workflows with server-side validation and audit.

**Exceptional conversation consultation**
- Do not create a broad SELECT policy that grants conversation/message access to `platform_admin`, RPGD, or `it_support` based on role alone.
- Exceptional consultation must use a dedicated server-side operation that validates the active, separately assigned `conversations.exceptional_read` grant, approved scope, validity period, justification, current actor/account status, and applicable organization boundary.
- The audit event must be durably written before any content is returned. If authorization, scope validation, or audit persistence fails, the operation returns no conversation content.
- RPGD's `conversations.exceptional_access.approve` capability is approval/revocation authority only; it does not grant content access. `it_support` is always denied conversation content.

**Storage and revocation**
- Supabase Storage policies must resolve each object to its attachment, message, and parent conversation and apply the same current membership/scope checks as database reads. Do not authorize based only on bucket membership, object path conventions, filename, or client-supplied metadata.
- On account deactivation, membership removal, block creation (for new direct communication), message deletion, or exceptional-grant expiry/revocation, server operations must enforce the relevant denial immediately. Blocking does not revoke read access to pre-existing direct history; it prevents new direct messages/calls only.
- Test every policy with positive, negative, cross-organization, removed-member, inactive-account, blocked-direct-message, expired-grant, attachment/object, and privilege-escalation cases. Include tests proving that an administrator without participant membership cannot read conversation content and that an audit-write failure prevents exceptional disclosure.

**Implementation boundary:** these rules are approved as the technical contract. They do not authorize a migration or schema change now. The current DEV database has no conversation tables; final SQL policy definitions depend on the reviewed schema and must be implemented and tested in DEV before any production proposal.

## 4.2 Reconciliation with SQA and ADR-001 v1.1

This section records the cross-issue resolution required by the SQA review of 19/11/2026. It does not approve ADR-001 v1.1, authorize a database migration, or authorize production changes.

### Message-content persistence

- The SQA correctly identified that the earlier draft field `messages.content text` could be interpreted as plaintext storage.
- The physical model now uses only the conceptual placeholder `encrypted_payload jsonb`; it represents an opaque, versioned authenticated-encryption envelope and must never store plaintext.
- The exact envelope fields, algorithm parameters, key custody/rotation/recovery, associated-data rules, and handling of edits/deletions/system events remain gated by the final PO/Tech Lead-approved ADR-001.
- Until that ADR is approved and reconciled, this remains a non-executable schema proposal. Do not create a plaintext fallback, migration, or message-persistence implementation based on the draft.

### Audit retention

- The PO-approved Issue #96 audit policy remains the current authority: **12 months standard retention** for the administrative audit categories defined in this document; longer preservation requires a documented legal obligation, investigation, or formal preservation hold.
- The SQA-reviewed ADR-001 v1.1 is explicitly a proposal submitted for validation, not an approved ADR. Its proposed five-year period must not silently replace or override the approved Issue #96 policy.
- If ADR-001 is revised to require a different period for a distinct cryptographic/security-log category, the final ADR must identify that category, its data owner, start event, legal basis, backup/expiry behavior, and deletion/anonymization process. The PO/Tech Lead must approve the category-specific reconciliation before implementation. Do not apply one generic five-year retention period to all audit domains.
- `conversation_audit_logs` remains authoritative for conversation lifecycle and membership events. Issue #97 remains authoritative for general platform/organization administration and security operations. Do not duplicate writes or create a competing audit source.

### Real-time calls

- Audio/video calls and screen sharing are real-time communication flows, not stored message attachments. The approved call requirements remain the source for call behavior.
- This Issue #96 document defines authorization boundaries and does not claim to define the complete cryptographic transport/signaling architecture for calls. ADR-001 or a linked call-security ADR must explicitly reference the real-time call architecture, transport protection, authorization checks, and revocation/termination behavior before call-security implementation is considered complete.

### Decision authority and implementation gate

- Exceptional conversation access continues to require RPGD approval, a separate time-bounded `conversations.exceptional_read` grant, server-side scope validation, justification, and durable audit persistence before disclosure. RPGD approval does not itself grant content access; operational IT cannot self-approve or grant access.
- The SQA comment is an alignment finding, not an approval of PR #130 or implementation evidence.
- No executable message schema, conversation RLS, encryption function, or production change may be based on unresolved ADR-001 details.

## 5. Capability catalog and approval status

The capability identifiers below define the controlled vocabulary. Approval status is explicit: department-manager capabilities and the narrow `it_support` device/session operations are approved business rules; exceptional-access capabilities are approved as a governance model but are not yet granted to any identity. No capability is granted merely because it appears in this catalog.

| Capability | Intended protected operation |
|---|---|
| `departments.read` | Read department records within authorized scope |
| `departments.members.manage` | Manage membership within an explicitly assigned department |
| `groups.read` | Read group metadata within authorized scope |
| `groups.manage` | Create and administer groups linked to an explicitly assigned department |
| `groups.members.manage` | Add or remove group participants |
| `devices.read` | Consult registered devices and sessions |
| `devices.manage` | Revoke devices/sessions when needed for security or support; does not include role, organization, or conversation administration |
| `audit.read` | Consult administrative audit records |
| `conversations.exceptional_read` | Perform an exceptional administrative conversation consultation |
| `conversations.exceptional_access.approve` | Approve/revoke time-bounded exceptional access; reserved to the formally designated RPGD function and does not grant conversation-content access |

No capability is granted by this catalog alone. The product owner approved department-scoped `departments.read`, `departments.members.manage`, `groups.read`, `groups.manage`, and `groups.members.manage` for collaborators explicitly designated as managers of the corresponding department. These capabilities must be constrained to the assigned department and its linked groups; they do not permit access to other departments, organization administration, or global permission management. The product owner also approved `devices.read` and the narrowly defined revocation operation represented by `devices.manage` for `it_support`, restricted to users in the organization associated with the support request being handled. Every operation requires an active, identified support ticket and a non-empty justification. Device/session consultations and revocations must be audited; revocation is limited to devices and sessions belonging to the user covered by that ticket. The organization and target-user scope must be validated server-side for every operation; cross-organization access is denied. `it_support` cannot change roles, administer organizations, access conversation content, or read the complete administrative audit history. `audit.read` is restricted to `platform_admin`. In particular, `conversations.exceptional_read` is not implied by `platform_admin`. Only the formally designated RPGD function, independent of operational IT, may approve/revoke the exceptional capability through `conversations.exceptional_access.approve`. This approval capability does not grant conversation-content access. The authorized identity must separately receive `conversations.exceptional_read` for a defined scope and validity period. Automatic expiry, explicit renewal, prompt revocation, and audit of designation and lifecycle events are required.

### 5.1 Approved role/capability boundary matrix

| Identity/category | Approved capability or authority | Mandatory scope/condition | Explicitly denied |
|---|---|---|---|
| `platform_admin` | Platform-level administration; `audit.read` for complete administrative audit history | Current authenticated identity and controlled server-side authorization | Routine conversation/message/attachment access; exceptional conversation access unless a separate grant is issued |
| `it_support` | `devices.read`; `devices.manage` limited to device/session revocation | Active identified support ticket, non-empty justification, target user belongs to the ticket's organization, and every target is validated server-side; each operation audited | Cross-organization or out-of-ticket access; role changes; organization administration; conversation content; complete audit history |
| `collaborator` (default) | Standard organization participation | Current active account and organization membership | Any elevated administrative capability not explicitly assigned |
| `collaborator` designated as department manager | `departments.read`, `departments.members.manage`, `groups.read`, `groups.manage`, `groups.members.manage` | Explicit assignment limited to the manager's own department(s) and groups linked to those departments | Other departments; organization administration; global role/permission administration; conversation content outside normal participant membership |
| Formally designated RPGD function (not a platform role) | `conversations.exceptional_access.approve` — approve/revoke a separate exceptional-read grant | Appointment/replacement by documented organizational-leadership decision; independent of operational IT; approval records are audited | No conversation-content access merely by holding the governance function; no operational IT self-approval |
| Specifically authorized exceptional reader | `conversations.exceptional_read` | Separate explicit grant to the identity, defined conversation/resource scope, non-empty justification, validity period, automatic expiry, revocation, server-side validation, and audit persistence before disclosure | No access outside the grant; no implicit entitlement from `platform_admin`, `it_support`, RPGD, or department-manager status |

This matrix records approved business boundaries, not live grants. No client may write role assignments, capabilities, exceptional-access grants, or audit events directly. Implementation must use controlled server-side operations and the appropriate authoritative audit domain. A role label alone never bypasses conversation membership or RLS.

## 6. Implementation design and safety gates

### Stage 1 — Role and permission matrix (3 SP)
- Apply the approved categories: `platform_admin`, `it_support`, and `collaborator`.
- Model department managers as collaborators with explicitly assigned capabilities to read their own department, manage its membership, and create/administer its linked groups. Enforce department and group scope; deny access to other departments, organization administration, and global permission management.
- Define the RPGD designation and controlled workflow/data model for approving and revoking exceptional access. The RPGD must be independent of operational IT. Approval must define the authorized identity, scope, justification, and validity period; grants expire automatically unless renewed, and revocation is audited. The RPGD does not gain conversation access merely by approving it.
- Define remaining capability grants for `it_support`. Each device/session operation requires an active, identified support ticket and a non-empty justification; consultations and revocations are audited; revocation is limited to the devices/sessions of the user covered by that ticket. Validate the ticket, organization, and target user server-side on every operation; deny expired/closed tickets, out-of-scope targets, and all cross-organization access.
- Preserve complete audit-history access for `platform_admin` only; give RPGD scoped oversight limited to exceptional-access lifecycle records. Record administrative, support, and exceptional-access events with the approved minimum fields, exclude message bodies/secrets/credentials, and implement the 12-month standard retention plus documented legal/investigation holds.

### Stage 2 — Server authorization and RLS (3 SP)
- Implement a centralized server-side authorization API.
- Use typed capability identifiers and explicit resource scope.
- Store privileged assignments in database-managed authorization data, inaccessible for self-service modification.
- Add RLS policies using authenticated identity and approved authorization data.
- Ensure authorization lookup errors fail closed.
- Add positive, negative, cross-scope, and privilege-escalation tests.

### Stage 3 — Administrative operations and audit (2 SP)
- Implement the exceptional conversation-access workflow only after the conversation schema exists.
- Require justification and persist the audit event before returning content.
- Protect audit records from client-side mutation.
- Test missing justification, operational-IT denial, denial when no explicit exceptional-read grant exists, invalid scope, and audit-write failure.

## 7. Remaining decisions and prerequisites

1. Implement the approved formal RPGD designation rule: organizational leadership appoints and replaces the RPGD through a documented decision. The named individual and detailed administrative procedure remain for leadership to define later. The RPGD is independent of operational IT, does not gain conversation access by approving it, and can approve only specific identities/scopes for a defined validity period. The controlled approval/revocation workflow and records remain implementation work.
2. Implement and test the approved `it_support` safeguards: require an active, identified support ticket and a non-empty justification for every operation; audit device/session consultations and revocations; limit revocation to devices/sessions of the user covered by the ticket; validate ticket status, organization, and target user server-side for every operation; deny closed/expired tickets and cross-organization or out-of-ticket targets. The role cannot change roles, administer organizations, access conversation content, or read the complete administrative audit history.
3. Implement the approved audit policy: `platform_admin` alone can read the complete administrative audit history; RPGD can read only exceptional-access oversight records; `it_support` cannot read the complete history. Record permission/role changes, administrative actions, support device/session operations, and exceptional conversation consultations with actor, action, target/scope, timestamp, outcome, correlation ID, and applicable justification. Exclude message bodies, attachments, passwords, tokens, and credentials. Standard retention is 12 months; longer retention requires a documented legal obligation, investigation, or formal preservation hold, followed by secure deletion or anonymization when permitted.
4. Implement the approved unified conversation data model (`conversations`, `conversation_members`, `messages`, `message_attachments`, and `conversation_audit_logs`) with `channel`, `direct`, and `group` types. The private-channel creator is automatically enrolled as a participant at creation. Before migrations, resolve the remaining direct-conversation lifecycle edge cases, the final column-level schema and database constraints needed to translate the approved RLS contract in section 4.1.2 into executable policies; then implement conversation-level RLS and the exceptional-read workflow. The private-storage and conversation-scoped file-access policy is already approved. Message editing/deletion behavior is already approved. Group participant removal and re-entry behavior are already approved.

Until these prerequisites are resolved, do not create a broad conversation-reading path or infer privileges from the existing `platform_admin` role.

## 8. Environment and release constraints

- Work only through GitHub Online, Supabase Online, and Vercel Online.
- Implement and validate database changes in `connexa-dev` first.
- Keep the production Supabase project untouched until DEV validation and an explicit production rollout approval.
- Run CI and Preview validation before requesting SQA review.
