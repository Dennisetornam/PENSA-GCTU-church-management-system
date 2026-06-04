# Scope Update — 2026-06-04 (Authoritative)

This document records a scope change and **supersedes** conflicting parts of
`system-design.md` and `auth-design.md`. Where they differ, this document wins.

---

## 1. Members are records only (no authentication)

**Removed entirely:** member login, member accounts, the invitation flow,
member password creation/reset, and member authentication. Members exist **only
as database records**. There are no member portals.

**Removed artifacts:**
- `account_invitations` table and the activation endpoint — dropped.
- `password_reset_tokens` table and reset endpoints — dropped (schema updated).
- Phase-1 auth plan tasks for member activation / password reset — void.

> Backend framework note: per the requirement for **Hono middleware**, the API
> backend is **Hono on Cloudflare Workers** (`src/`); the admin UI will be a
> React SPA served via Workers static assets. This updates the earlier
> "React Router as the API" choice. D1 + Drizzle and all data design are unchanged.

---

## 2. Authenticating roles (4)

| # | Role | Logs in | Scope |
|---|---|---|---|
| 1 | Super Admin (`super_admin`) | Yes | Global incl. users/roles/audit/settings |
| 2 | Church Admin (`church_admin`) | Yes | Full domain + approvals + lookups |
| 3 | Department Leader (`department_leader`) | Yes | Own department(s) |
| 4 | Cell Leader (`cell_leader`) | Yes | Own cell |

Only administrators and church leaders have system login access. Admin/leader
accounts are **provisioned directly by a Super Admin** (no self-service signup or
reset). Reference seed updated to these four roles.

---

## 3. Registration → Approval → Member Record

```
Visitor
  → QR code → public /register form
  → submission stored (registration_status = pending)
  → appears in admin "Pending Approval" queue
  → Admin reviews → Approve
       • member record created / finalized
       • registration_status = approved
       • membership_status defaults to 'visitor'
       • member_code assigned: PENSA-YYYY-NNNN  (atomic per-year counter)
  → member information stored permanently
  (Reject → registration_status = rejected, reason recorded)
```

**Auto member ID:** assigned on approval via an atomic SQL counter:
```sql
INSERT INTO member_code_counters(year, last_seq) VALUES (:year, 1)
  ON CONFLICT(year) DO UPDATE SET last_seq = last_seq + 1
  RETURNING last_seq;          -- format: PENSA-{year}-{seq zero-padded to 4}
```
Example sequence: `PENSA-2026-0001`, `PENSA-2026-0002`, … `member_code` is unique among live records.

---

## 4. Attendance Workflow

```
1. Member arrives at church.
2. Usher/Admin searches by Full Name | Phone Number | Member ID (member_code).
3. Member profile appears instantly (indexed lookup).
4. Admin marks attendance.
5. Attendance record stored (unique per session + member).
```

**Statuses:** `present` · `late` · `excused` · `absent` (CHECK-constrained on
`attendance_records.status`).

---

## 5. Fast-lookup indexes (added to `db/schema.sql`)

| Search field | Index |
|---|---|
| Full name | `ix_members_full_name` on generated `full_name` column |
| Phone number | `ux_members_phone_live` (unique, live rows) |
| Member ID | `ux_members_member_code` (unique, live rows) |
| Department | `ix_member_dept_department` on `member_departments(department_id)` |
| Cell | `ix_members_cell` on `members(cell_id)` |

`full_name` is a STORED generated column: `trim(first_name || ' ' ||
coalesce(other_names || ' ', '') || last_name)` — search hits the index, not a scan.

---

## 6. Build focus (current and next phases)

Registration · Approval Workflow · Membership Management · Attendance Tracking ·
Reporting · Analytics. **Not building:** member authentication or member portals.

---

## 7. Rate limiting

Implemented now — see `docs/architecture/rate-limiting.md`. Protects `/register`,
`/auth/login`, `/check-in`, `/attendance/*`. No member-auth limiting (members
don't authenticate).
