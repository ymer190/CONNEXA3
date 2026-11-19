# Issue #96 — Authorization and permissions design

Status: approved role structure and privacy boundary — platform administration, operational IT support, and collaborators are distinct authorization categories; department managers remain collaborators with department-scoped capabilities, not global administrators. Exceptional conversation access requires explicit business approval and a separate audited capability. Detailed grants, scope rules, approval authority, and resource model remain pending.

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
- `it_support`: operational IT support, limited to consulting registered devices and sessions and revoking devices/sessions when needed for security or support. It has no routine conversation-content access, cannot change platform or organization roles, cannot administer organizations, and cannot consult the complete administrative audit history. Its target-user and tenant scope must be explicitly authorized; this role does not imply unrestricted access across all organizations.
- `collaborator`: the standard organization user category. A collaborator who manages a department receives additional capabilities scoped only to the department(s) assigned to them; department management does not turn that person into a global/platform administrator.

A department manager is therefore not a separate global platform role. Department-manager authority is represented by department-scoped capabilities assigned to a collaborator. This is a high-level role/category decision, not yet a grant of specific permissions. Exact capability assignments, organization boundaries, and approval workflows remain to be defined in the permission matrix.

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
- General platform administration does not implicitly grant conversation-content access. The exceptional permission must be distinct, independently checked, explicitly granted, and revocable.
- Every exceptional consultation requires a non-empty justification.
- Authorization and scope must be validated server-side before any conversation content is returned.
- Each consultation must be audited with at least administrator identity, justification, conversation/resource scope, and timestamp.
- Audit persistence must succeed before content is disclosed; if the audit write fails, access must fail closed.
- No individual notification is sent to the collaborator at the moment of consultation, as previously directed by the product owner; this behavior should be reconfirmed with the broader privacy policy before implementation.
- Ordinary authenticated clients must not be able to insert, update, or delete audit records.
- Audit-read access is restricted to `platform_admin`. The `it_support` role may perform its explicitly authorized operational support actions but cannot consult the complete administrative audit history. This is a role-level boundary; the exact audit scope, sensitive-field visibility, and retention policy remain to be specified.

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
| `devices.manage` | Revoke devices/sessions when needed for security or support; does not include role, organization, or conversation administration |
| `audit.read` | Consult administrative audit records |
| `conversations.exceptional_read` | Perform an exceptional administrative conversation consultation |

No capability is granted by this catalog alone. The product owner approved `devices.read` and the narrowly defined revocation operation represented by `devices.manage` for `it_support`, subject to explicit target-user/tenant scope. `it_support` cannot change roles, administer organizations, access conversation content, or read the complete administrative audit history. `audit.read` is restricted to `platform_admin`. In particular, `conversations.exceptional_read` is not implied by `platform_admin`. Business approval, eligible identities, approval authority, and grant/revocation process must be defined before any exceptional access is implemented.

## 6. Implementation design and safety gates

### Stage 1 — Role and permission matrix (3 SP)
- Apply the approved categories: `platform_admin`, `it_support`, and `collaborator`.
- Model department managers as collaborators with department-scoped capabilities, not as global platform administrators.
- Define who may approve exceptional access and which specific identities (if any) may receive it through controlled authorization data; the product owner has approved the principle that access is exceptional only, not routine.
- Define remaining capability grants and scope boundaries, including the authorized target-user/tenant scope for `it_support` device/session operations.
- Preserve the approved audit-reader boundary (`platform_admin` only) and define the audit scope, sensitive-field visibility, and retention period.

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

1. Define who is eligible for exceptional conversation-content access and who can approve/revoke it. The product owner has approved that no administrator, including `platform_admin`, has routine access; DEV currently has one `platform_admin` row, but that does not confer exceptional-read eligibility.
2. Define the authorized target-user/tenant scope, operational safeguards, and audit requirements for the approved `it_support` device/session read and revocation operations. The role cannot change roles, administer organizations, access conversation content, or read the complete administrative audit history.
3. Define the exact department-scoped capabilities for collaborators who are department managers, including whether they can manage membership and groups within their department.
4. Define audit scope, sensitive-field visibility, and retention period. The approved reader boundary is `platform_admin` only; `it_support` cannot consult the complete administrative audit history.
5. Implement the conversation data model before conversation-level RLS and exceptional-read workflow can be tested end-to-end.

Until these prerequisites are resolved, do not create a broad conversation-reading path or infer privileges from the existing `platform_admin` role.

## 8. Environment and release constraints

- Work only through GitHub Online, Supabase Online, and Vercel Online.
- Implement and validate database changes in `connexa-dev` first.
- Keep the production Supabase project untouched until DEV validation and an explicit production rollout approval.
- Run CI and Preview validation before requesting SQA review.
