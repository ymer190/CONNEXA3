# Issue #96 — Authorization and permissions design

Status: technical proposal; business-role mapping pending explicit approval.

## 1. Purpose

Define a least-privilege authorization model for CONNEXA3. Every protected operation must be authorized on the server and, where data access is involved, enforced again by PostgreSQL Row Level Security (RLS). UI visibility is never a security boundary.

This document is a proposal for Issue #96. It does not authorize production changes or define unapproved business privileges.

## 2. Verified baseline

- Supabase Auth is integrated through `@supabase/ssr`.
- The server-side client uses the public/publishable key and the authenticated session.
- `public.platform_users` currently accepts only `platform_admin`.
- RLS is enabled on the four existing public tables: `organizations`, `profiles`, `organization_members`, and `platform_users`.
- Authenticated users can read only their own `platform_users` row.
- The current middleware and admin page check membership in `platform_users` for the `/admin` route.
- The legacy `owner/admin/member` organization roles are not the approved role model for the current CONNEXA3 product.

## 3. Authorization principles

1. Deny by default. Missing identity, missing role, missing permission, invalid scope, or authorization lookup errors result in denial.
2. Derive identity from the validated Supabase Auth session (`auth.uid()` in database policies). Never trust user-supplied IDs, role fields, headers, or editable metadata as proof of authority.
3. Enforce permissions in server-side operations and in RLS. Middleware and UI checks are supplementary, not sufficient.
4. Separate role assignment from ordinary user capabilities. A user must not be able to grant or elevate their own role.
5. Apply explicit resource scope to every decision (for example, department, group, conversation, or device) once those entities and relationships are defined.
6. Keep privileged credentials server-side only. Do not expose service-role credentials to the browser.
7. Do not deploy schema or authorization changes to PROD as part of this proposal.

## 4. Provisional capability catalog

The following capability names are proposed as stable identifiers. Their assignment to business roles remains pending approval.

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

No capability is granted by this catalog alone. Role-to-capability grants and scope rules must be approved before implementation.

## 5. Exceptional administrative conversation access

The acceptance criteria of Issue #96 require all of the following:

- A dedicated permission, separate from general platform administration.
- A non-empty justification supplied for each exceptional consultation.
- Server-side authorization before conversation content is returned.
- Scope validation before content is returned.
- An audit record for each consultation containing at least the administrator identity, justification, conversation/resource scope, and timestamp.
- No individual notification to the collaborator at the moment of consultation, as directed by the client.
- Audit records must not be writable, editable, or deletable by ordinary authenticated clients.

The exact allowed administrator roles, scope boundaries, retention period, and authorized audit readers remain business/security decisions. They must be settled before the database contract is finalized.

## 6. Proposed implementation sequence

### Stage 1 — Role and permission matrix (3 SP)
- Confirm role names and role hierarchy.
- Define capability grants for each role.
- Define scope boundaries and delegation rules.
- Approve exceptional conversation access and audit-reader permissions.

### Stage 2 — Server authorization and RLS (3 SP)
- Implement a centralized server-side authorization API.
- Use typed capability identifiers and explicit resource scope.
- Add RLS policies using authenticated identity and approved authorization data.
- Ensure authorization lookup errors fail closed.
- Add positive, negative, cross-scope, and privilege-escalation tests.

### Stage 3 — Administrative operations and audit (2 SP)
- Implement the exceptional conversation-access workflow.
- Require justification and write audit records before/with access according to a failure-safe transaction design.
- Protect audit records from client-side mutation.
- Test missing justification, denied roles, invalid scope, and audit-write failure.

## 7. Decisions required before schema changes

1. Are the three principal IT administrators the only users allowed to receive the unrestricted platform-administration capability?
2. Which exact capabilities may the operational IT team receive, and are any of them allowed to consult conversation content exceptionally?
3. Are department managers a distinct authorization role in this release, or are they ordinary collaborators with department-scoped features only?
4. Which roles may read audit records, and what is the required retention period for exceptional conversation-access events?

Until these decisions are approved, the implementation must not infer broader privileges from the existing `platform_admin` role.

## 8. Environment and release constraints

- Work only through GitHub Online, Supabase Online, and Vercel Online.
- Implement and validate database changes in `connexa-dev` first.
- Keep the production Supabase project untouched until DEV validation and an explicit production rollout approval.
- Run CI and Preview validation before requesting SQA review.
