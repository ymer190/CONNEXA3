# Issue #96 — Authorization and permissions design

Status: approved role structure and privacy boundary — platform administration, operational IT support, and collaborators are distinct authorization categories; department managers remain collaborators with department-scoped capabilities, not global administrators. Exceptional conversation access requires explicit approval by a formally designated business owner independent of operational IT, and a separate audited capability. Detailed grants, scope rules, and resource model remain pending.

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
- `it_support`: operational IT support, limited to consulting registered devices and sessions and revoking devices/sessions when needed for security or support. Access is restricted to users belonging to the organization associated with the support request being handled; the support role does not grant cross-organization or unrestricted tenant access. The target organization and users must be validated server-side for each operation. It has no routine conversation-content access, cannot change platform or organization roles, cannot administer organizations, and cannot consult the complete administrative audit history.
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
- **Approval and revocation authority:** only a formally designated business owner, independent of the operational IT team, may approve or revoke exceptional conversation-content access. Operational IT personnel cannot approve, grant, or revoke this capability for themselves or others.
- General platform administration does not implicitly grant conversation-content access. The exceptional permission must be distinct, independently checked, explicitly granted, and revocable.
- Every exceptional consultation requires a non-empty justification.
- Authorization and scope must be validated server-side before any conversation content is returned.
- Each consultation must be audited with at least administrator identity, justification, conversation/resource scope, and timestamp.
- Audit persistence must succeed before content is disclosed; if the audit write fails, access must fail closed.
- No individual notification is sent to the collaborator at the moment of consultation, as previously directed by the product owner; this behavior should be reconfirmed with the broader privacy policy before implementation.
- Ordinary authenticated clients must not be able to insert, update, or delete audit records.
- Audit-read access is restricted to `platform_admin`. The `it_support` role may perform its explicitly authorized operational support actions but cannot consult the complete administrative audit history. This is a role-level boundary; the exact audit scope, sensitive-field visibility, and retention policy remain to be specified.

The business owner designation, eligible identities, approval/revocation records, and capability lifecycle must be represented through controlled authorization data and audited administrative operations. Do not hardcode user IDs in policies, infer eligibility from the number of rows, or trust client-editable metadata.

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

No capability is granted by this catalog alone. The product owner approved department-scoped `departments.read`, `departments.members.manage`, `groups.read`, `groups.manage`, and `groups.members.manage` for collaborators explicitly designated as managers of the corresponding department. These capabilities must be constrained to the assigned department and its linked groups; they do not permit access to other departments, organization administration, or global permission management. The product owner also approved `devices.read` and the narrowly defined revocation operation represented by `devices.manage` for `it_support`, restricted to users in the organization associated with the support request being handled. The organization and target-user scope must be validated server-side for every operation; cross-organization access is denied. `it_support` cannot change roles, administer organizations, access conversation content, or read the complete administrative audit history. `audit.read` is restricted to `platform_admin`. In particular, `conversations.exceptional_read` is not implied by `platform_admin`. Only the formally designated business owner independent of operational IT may approve/revoke the exceptional capability; eligible identities and the grant/revocation workflow must be specified before implementation.

## 6. Implementation design and safety gates

### Stage 1 — Role and permission matrix (3 SP)
- Apply the approved categories: `platform_admin`, `it_support`, and `collaborator`.
- Model department managers as collaborators with explicitly assigned capabilities to read their own department, manage its membership, and create/administer its linked groups. Enforce department and group scope; deny access to other departments, organization administration, and global permission management.
- Define the formally designated business owner and controlled workflow/data model for approving and revoking exceptional access. The approver must be independent of operational IT; operational IT cannot self-approve or self-grant this capability.
- Define remaining capability grants and operational safeguards for `it_support`; its approved device/session scope is limited to users in the organization associated with the support request being handled, with server-side validation and no cross-organization access.
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

1. Identify the named business owner (or formal business function) responsible for approving/revoking exceptional access, and define the controlled approval/revocation workflow and records. The approved governance rule is that this authority belongs to a formally designated business owner independent of operational IT.
2. Define operational safeguards and audit requirements for `it_support` device/session operations. The approved scope is users belonging to the organization associated with the support request being handled; every target organization and user must be validated server-side, and cross-organization access is denied. The role cannot change roles, administer organizations, access conversation content, or read the complete administrative audit history.
3. Define audit scope, sensitive-field visibility, and retention period. The approved reader boundary is `platform_admin` only; `it_support` cannot consult the complete administrative audit history.
4. Implement the conversation data model before conversation-level RLS and exceptional-read workflow can be tested end-to-end.

Until these prerequisites are resolved, do not create a broad conversation-reading path or infer privileges from the existing `platform_admin` role.

## 8. Environment and release constraints

- Work only through GitHub Online, Supabase Online, and Vercel Online.
- Implement and validate database changes in `connexa-dev` first.
- Keep the production Supabase project untouched until DEV validation and an explicit production rollout approval.
- Run CI and Preview validation before requesting SQA review.
