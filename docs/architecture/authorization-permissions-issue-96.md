# Issue #96 — Authorization and permissions design

Status: privacy boundary for exceptional conversation access agreed in principle; eligibility, broader role matrix, and resource model remain pending.

## 1. Purpose

Define a least-privilege authorization model for CONNEXA3. Every protected operation must be authorized on the server and, where data access is involved, enforced again by PostgreSQL Row Level Security (RLS). UI visibility is never a security boundary.

This document records the approved business decision for exceptional conversation access. It does not authorize production changes or grant permissions by itself.

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

## 3. Authorization principles

1. Deny by default. Missing identity, missing role, missing permission, invalid scope, or authorization lookup errors result in denial.
2. Derive identity from the validated Supabase Auth session (`auth.uid()` in database policies). Never trust user-supplied IDs, role fields, headers, or editable metadata as proof of authority.
3. Enforce permissions in server-side operations and in RLS. Middleware and UI checks are supplementary, not sufficient.
4. Separate role assignment from ordinary user capabilities. A user must not be able to grant or elevate their own role.
5. Apply explicit resource scope to every decision (for example, department, group, conversation, or device) once those entities and relationships are defined.
6. Keep privileged credentials server-side only. Do not expose service-role credentials to the browser.
7. Do not deploy schema or authorization changes to PROD as part of this proposal.

## 4. Approved decision — exceptional conversation access

The business decision for Issue #96 is:

- The operational IT team must not receive direct access to conversation content as part of ordinary support duties.
- Exceptional conversation-content access, if approved for a specific person or role, must be granted through a separate, explicit capability. The currently existing `platform_admin` account is not automatically eligible; its eligibility has not yet been approved.
- General platform administration does not implicitly grant conversation-content access. The exceptional permission must be distinct and checked independently.
- Every exceptional consultation requires a non-empty justification.
- Authorization and scope must be validated server-side before any conversation content is returned.
- Each consultation must be audited with at least administrator identity, justification, conversation/resource scope, and timestamp.
- Audit persistence must succeed before content is disclosed; if the audit write fails, access must fail closed.
- No individual notification is sent to the collaborator at the moment of consultation, as directed by the client.
- Ordinary authenticated clients must not be able to insert, update, or delete audit records.

Any future eligible person must be designated through controlled, server/database-managed authorization data after explicit business approval. Do not hardcode user IDs in policies, infer eligibility from the number of rows, or trust client-editable metadata.

## 5. Provisional capability catalog

These identifiers are proposals, not grants. Their assignment remains pending the complete role matrix and resource model.

| Capability | Intended protected operation |
|---|---|
| `departments.read` | Read department records within authorized scope |
| `departments.manage` | Create, update, or deactivate departments |
| `groups.read` | Read group metadata within authorized scope |
| `groups.manage` | Create, update, or deactivate corporate groups |
| `groups.members.manage` | Add or remove group participants |
| `devices.read` | Consult registered devices and sessions |
| `devices.manage` | Approve, revoke, or otherwise manage devices/sessions |
| `audit.read` | Consult administrative audit records |
| `conversations.exceptional_read` | Perform an exceptional administrative conversation consultation |

No capability is granted by this catalog alone. In particular, `conversations.exceptional_read` is not implied by `platform_admin`; eligible identities, approval authority, and grant/revocation process remain to be defined.

## 6. Implementation design and safety gates

### Stage 1 — Role and permission matrix (3 SP)
- Confirm role names and role hierarchy for principal IT administrators, operational IT, department managers, and collaborators.
- Decide whether exceptional access should exist, who may approve it, and which specific identities (if any) may receive it through controlled authorization data.
- Define the remaining capability grants and scope boundaries.
- Decide which roles may read audit records and the retention period.

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
- Test missing justification, operational-IT denial, non-designated-admin denial, invalid scope, and audit-write failure.

## 7. Remaining decisions and prerequisites

1. Decide whether exceptional conversation-content access will be enabled at all, who is eligible to receive it, and who can approve/revoke it. DEV currently has one `platform_admin` row, but that does not confer exceptional-read eligibility.
2. Define the exact operational capabilities for the IT support team, excluding conversation-content access.
3. Decide whether department managers are a distinct platform role or collaborators with department-scoped capabilities.
4. Define audit readers and retention period.
5. Implement the conversation data model before conversation-level RLS and exceptional-read workflow can be tested end-to-end.

Until these prerequisites are resolved, do not create a broad conversation-reading path or infer privileges from the existing `platform_admin` role.

## 8. Environment and release constraints

- Work only through GitHub Online, Supabase Online, and Vercel Online.
- Implement and validate database changes in `connexa-dev` first.
- Keep the production Supabase project untouched until DEV validation and an explicit production rollout approval.
- Run CI and Preview validation before requesting SQA review.
