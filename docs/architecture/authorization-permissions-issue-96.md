# Issue #96 — Authorization and permissions design

Status: approved role structure and privacy boundary — platform administration, operational IT support, and collaborators are distinct authorization categories; department managers remain collaborators with department-scoped capabilities, not global administrators. Exceptional conversation access requires explicit approval by a formally designated Responsible for Privacy and Data Governance (RPGD), independent of operational IT, and a separate audited capability. The RPGD is a formally designated business function, not a new global platform role. Detailed grants, scope rules, and resource model remain pending.

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
- `conversation_audit_logs`: conversation-specific security/audit events, integrated with the approved audit governance, retention, and data-minimization rules. It must not duplicate message content.

The approved conversation types are:

- `channel`: organization channel, supporting the already-established public/private channel distinction.
- `direct`: private conversation between two people.
- `group`: private conversation among multiple people.

All types share the same conversation, membership, message, and attachment foundations. Organization/tenant scope must be explicit for organization-owned conversations and validated server-side. Normal content access is based on valid participation/membership and the applicable channel visibility/join rules; administrative role alone never grants read access. Exceptional access remains a separate, explicitly approved, time-bounded `conversations.exceptional_read` capability with scope, justification, pre-disclosure audit persistence, and fail-closed behavior.

This approval establishes the architectural entities and conversation categories, not the final column-level schema or every membership lifecycle rule. Detailed decisions still required before migrations include public-channel discovery/join semantics, whether a private-channel creator is automatically a participant, direct-conversation uniqueness/lifecycle, group membership changes, message editing/deletion rules, attachment storage policy, and exact RLS predicates. Do not infer these details or deploy a schema until they are specified and reviewed.

### 4.1.1 Public and private channel discovery and participation

The product owner approved the following initial channel-entry rules:

- **Public channels:** any active member of the owning organization may discover the channel and explicitly join it without an invitation. Discovery and joining remain organization-scoped; users from another organization must be denied.
- **Private channels:** the channel is not discoverable to non-participants. Access requires an explicit invitation or an explicit addition by an authorized participant/manager under the channel's applicable management rules. Merely being an organization member, department manager, or platform administrator does not grant access.
- In both cases, message access is governed by valid conversation membership and server-side/RLS checks. After joining a public channel, an active member of the owning organization may read the channel's available message history, including messages created before that member joined. This historical visibility is limited to the public channel and does not grant access to private-channel history or content outside the member's organization. Private-channel history remains restricted to authorized participants.
- **Private-channel creator:** the creator is automatically added as a participant when the private channel is created. This membership is created atomically with the channel so the creator can immediately access and administer its content under the same participant-based access rules. Administrative role alone remains insufficient; access follows the explicit membership record.

These rules define the initial product behavior, not the final database schema or RLS predicates. Implement only after the remaining details are reviewed.

## 5. Provisional capability catalog

These identifiers are proposals, not grants. Their assignment remains pending the complete role matrix and resource model.

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
4. Implement the approved unified conversation data model (`conversations`, `conversation_members`, `messages`, `message_attachments`, and `conversation_audit_logs`) with `channel`, `direct`, and `group` types. The private-channel creator is automatically enrolled as a participant at creation. Before migrations, resolve the remaining direct/group membership lifecycle, message, attachment, and exact RLS details listed in section 4.1; then implement conversation-level RLS and exceptional-read workflow.

Until these prerequisites are resolved, do not create a broad conversation-reading path or infer privileges from the existing `platform_admin` role.

## 8. Environment and release constraints

- Work only through GitHub Online, Supabase Online, and Vercel Online.
- Implement and validate database changes in `connexa-dev` first.
- Keep the production Supabase project untouched until DEV validation and an explicit production rollout approval.
- Run CI and Preview validation before requesting SQA review.
