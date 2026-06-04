# PENSA GCTU CMS — Admin Dashboard Design

**Status:** Proposed (design only — no code) · **Date:** 2026-06-04
**Audience:** the 4 authenticating roles — Super Admin, Church Admin, Department Leader, Cell Leader
**Stack:** React (Vite) SPA served via the Worker · Hono API (`/api/*`) · TanStack Query (data) · TanStack Table (grids) · Recharts (charts) · Tailwind + shadcn/ui · auth via `__Host-at` JWT cookie

> Members never see this dashboard (records-only). Every section is **role-scoped**: Department Leaders see only their department; Cell Leaders only their cell; Church/Super Admin see everything; Super Admin additionally owns Users/Roles/Audit.

---

## 1. Global Layout & Navigation

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TOPBAR:  [≡] PENSA GCTU      [ 🔍 global member search ]   [🔔] [▾ User]   │
├───────────┬──────────────────────────────────────────────────────────────┤
│ SIDEBAR   │  CONTENT AREA                                                  │
│           │  ┌────────────────────────────────────────────────────────┐   │
│ ▣ Overview│  │ Page header: Title · breadcrumbs · primary actions      │   │
│ ◧ Members │  ├────────────────────────────────────────────────────────┤   │
│ ⊕ Registr.│  │                                                          │   │
│ ✓ Attend. │  │   Page body (tables / cards / charts / forms)           │   │
│ ⬡ Depart. │  │                                                          │   │
│ ◍ Cells   │  │                                                          │   │
│ ▤ Reports │  │                                                          │   │
│ ▦ Analytics  └────────────────────────────────────────────────────────┘   │
│ ⚙ Settings│                                                                │
└───────────┴──────────────────────────────────────────────────────────────┘
Mobile: sidebar collapses to a bottom/hamburger drawer; tables become cards.
```

**Nav visibility by role:**

| Section | super_admin | church_admin | department_leader | cell_leader |
|---|:--:|:--:|:--:|:--:|
| Overview | ✔ | ✔ | ✔ (dept) | ✔ (cell) |
| Members | ✔ | ✔ | ✔ (dept) | ✔ (cell, read) |
| Registrations | ✔ | ✔ | — | — |
| Attendance | ✔ | ✔ | ✔ (dept) | ✔ (cell) |
| Departments | ✔ | ✔ | ✔ (own, read) | — |
| Cells | ✔ | ✔ | — | ✔ (own, read) |
| Reports | ✔ | ✔ | ✔ (dept) | ✔ (cell) |
| Analytics | ✔ | ✔ | ✔ (dept) | ✔ (cell) |
| Settings | ✔ | ✔ (lookups only) | — | — |
| Settings → Users/Roles/Audit | ✔ | — | — | — |

**App-shell component hierarchy (shared by all pages):**
```
<AdminApp>
  <AuthGuard>                         // redirects to /login if no valid session
    <DashboardLayout>
      <Topbar> <GlobalSearch/> <NotificationsBell/> <UserMenu/> </Topbar>
      <Sidebar> <NavItem* role-filtered/> </Sidebar>
      <ContentOutlet>                  // React Router <Outlet/>
        <PageHeader/> + page body
      </ContentOutlet>
    </DashboardLayout>
  </AuthGuard>
</AdminApp>
```
**Shared/reusable components:** `DataTable` (sortable/paginated), `FilterBar`, `StatCard`, `ChartCard`, `EntityDrawer`/`Modal`, `StatusBadge`, `ConfirmDialog`, `EmptyState`, `Toast`, `Pagination`, `SearchInput`, `Avatar`, `DateRangePicker`, `ExportButton`.

**Cross-cutting API:** `GET /api/me` (user, role, scope) · `GET /api/search/members?q=` (global topbar search).

---

## 2. Overview (`/dashboard`)

```
┌ Overview ────────────────────────────────────────── [Quick: + Check-in ▾] ┐
│ [👥 Members 1,240] [🆕 Pending 18] [✓ Today 312] [📈 New (mo) 42]          │
├───────────────────────────────────────────┬───────────────────────────────┤
│  Membership growth (line, 12 mo)           │  Attendance by gathering (bar) │
├───────────────────────────────────────────┴───────────────────────────────┤
│  Recent activity (registrations approved, attendance taken, members added) │
│  Quick actions: [Approve registrations →] [Take attendance →] [Add member] │
└────────────────────────────────────────────────────────────────────────────┘
```
- **Page structure:** single route `/dashboard`. KPI row + 2 charts + activity feed + quick actions. Leaders see scope-limited KPIs/charts.
- **Components:** `OverviewPage → KpiRow(StatCard×4) → ChartCard(MembershipGrowthChart) → ChartCard(AttendanceByGatheringChart) → RecentActivityFeed → QuickActions`.
- **API:** `GET /api/overview/summary` (KPIs, scope-aware) · `GET /api/analytics/membership-growth?range=` · `GET /api/analytics/attendance-by-gathering?range=` · `GET /api/activity?limit=`.

---

## 3. Members (`/members`)

```
┌ Members ─────────────────── [🔍 name / phone / member ID] [Filters ▾] [+ Add] [⤓ Export] ┐
│ Code         Name          Phone        Cell     Dept(s)     Status     │
│ PENSA-2026-1 Ama Boateng    +23324…      Dunamis  Media       Visitor  ⋯ │
│ PENSA-2026-2 Kwame Mensah   +23320…      Peniel   Music,Prayer Actual   ⋯ │
│ …                                            [‹ 1 2 3 … ›]  rows: 25 ▾    │
└──────────────────────────────────────────────────────────────────────────┘
Row click → Member profile drawer/page:
┌ Ama Boateng · PENSA-2026-0001 · [Visitor ▾] ───────────── [Edit] [⋯] ┐
│ [photo]  Tabs: ▸Profile ▸Attendance ▸Departments ▸History            │
│ Profile: programme, residence, baptism, contacts, cell, gathering    │
└──────────────────────────────────────────────────────────────────────┘
```
- **Page structure:** `/members` (list) · `/members/:id` (profile w/ tabs) · `/members/:id/edit`. Search keys: `full_name`, `phone_number`, `member_code` (indexed). Filters: status, cell, department, programme, residence.
- **Components:** `MembersPage → FilterBar + DataTable(MemberRow, RowActions)`; `MemberProfilePage → ProfileHeader(Avatar, StatusSelect) → Tabs[ProfileTab, AttendanceHistoryTab, DepartmentsTab, MembershipHistoryTab] → MemberEditForm`.
- **API:** `GET /api/members?q&status&cellId&departmentId&programmeId&page&limit` · `GET /api/members/:id` · `PATCH /api/members/:id` · `DELETE /api/members/:id` (soft, admin) · `GET /api/members/:id/attendance` · `GET /api/members/:id/history` · `POST /api/members/:id/status` (lifecycle change → writes `membership_history`) · `GET /api/members/export?...` · image via `GET /api/members/:id/photo`.
- **Scope:** dept_leader → members in their department; cell_leader → read-only members in their cell.

---

## 4. Registrations (`/registrations`)

```
┌ Registrations ─── [Pending 18] [Approved] [Rejected] ──── [🔍] [Filters ▾] ┐
│ ☐ REG-2026-0007  Ama Boateng   +23324…  Dunamis  ⚠ possible dup   [Review]│
│ ☐ REG-2026-0008  John Doe      +23355…  Peniel                    [Review]│
└──────────────────────────────────────────────────────────────────────────┘
Review modal:
┌ Review REG-2026-0007 ───────────────────────────── ⚠ Possible duplicate ──┐
│ [photo]   Full submission (all fields, read-only/editable)                 │
│ Duplicate signals: phone_match_pending → [compare with member ▸]           │
│ Membership status on approval: [Visitor ▾]                                 │
│           [ Reject (reason…) ]                 [ Approve → create member ] │
└────────────────────────────────────────────────────────────────────────────┘
```
- **Page structure:** `/registrations?status=pending|approved|rejected` (queue) + review modal. Default = pending. Possible-duplicate badge surfaces dedupe signals.
- **Components:** `RegistrationsPage → StatusTabs + FilterBar + RegistrationQueue(RegistrationCard[DuplicateBadge])` → `ReviewModal(SubmissionView, PhotoPreview, DuplicateCompare, StatusSelect, ApproveButton, RejectForm)`.
- **API:** `GET /api/registrations?status&q&page` · `GET /api/registrations/:id` · `POST /api/registrations/:id/approve` (→ creates member, assigns `PENSA-YYYY-NNNN`, promotes draft image to `members/…`, writes audit + membership_history) · `POST /api/registrations/:id/reject` (reason) · `GET /api/registrations/:id/duplicate` (compare candidate).
- **Scope:** church_admin / super_admin only.

---

## 5. Attendance (`/attendance`)

```
┌ Attendance ──────────────────────────────── [+ New session] ┐
│ Sessions:  Sun Service · 2026-06-07 · 312 ✓   [open ▸]       │
│            Midweek · 2026-06-04 · 180 ✓        [closed]      │
└──────────────────────────────────────────────────────────────┘
Mark attendance (session open):
┌ Sunday Service · 2026-06-07 ──── [Filter: Cell ▾ Dept ▾] [Mark all present]┐
│ 🔍 search member (name / phone / ID)                                       │
│ Ama Boateng   PENSA-2026-0001   ( ●Present ○Late ○Excused ○Absent )        │
│ Kwame Mensah  PENSA-2026-0002   ( ○Present ●Late  ○Excused ○Absent )       │
│                                              [ Save ]  [ Close session ]    │
└─────────────────────────────────────────────────────────────────────────────┘
```
- **Page structure:** `/attendance` (session list) · `/attendance/new` (create: gathering type + date) · `/attendance/:sessionId` (mark/check-in). Statuses: Present · Late · Excused · Absent. Fast member search + bulk "mark all present" + cell/department filters.
- **Components:** `AttendancePage → SessionList(SessionRow)`; `NewSessionForm(GatheringTypeSelect, DatePicker)`; `MarkAttendancePage → SessionHeader + AttendanceFilterBar + MemberSearch + RosterList(AttendanceRow[StatusToggle]) + SaveBar`.
- **API:** `GET /api/attendance/sessions?gatheringTypeId&date&page` · `POST /api/attendance/sessions` · `GET /api/attendance/sessions/:id` · `GET /api/attendance/sessions/:id/roster?cellId&departmentId&q` · `PUT /api/attendance/sessions/:id/records` (bulk upsert: `[{memberId,status}]`) · `POST /api/attendance/sessions/:id/close` · `GET /api/check-in?q=` (fast lookup, rate-limited 300/h).
- **Scope:** leaders scoped to their dept/cell roster.

---

## 6. Departments (`/departments`)

```
┌ Departments ───────────────────────────────── [+ New] (admin) ┐
│ Media           Lead: Kwesi A.   members: 24   [Open ▸]        │
│ Music and Drama Lead: —          members: 31   [Open ▸]        │
│ Prayer · Organizing · Bible Studies …                          │
└────────────────────────────────────────────────────────────────┘
Department detail: roster table + [Assign member] + set leader + edit/deactivate
```
- **Page structure:** `/departments` (list) · `/departments/:id` (roster + leader + settings).
- **Components:** `DepartmentsPage → DataTable(DepartmentRow)`; `DepartmentDetailPage → DeptHeader(LeaderSelect) → RosterTable(MemberRow) → AssignMemberDialog → DeptEditForm`.
- **API:** `GET /api/departments` · `POST /api/departments` (admin) · `GET /api/departments/:id` · `PATCH /api/departments/:id` · `GET /api/departments/:id/members` · `POST /api/departments/:id/members` (assign) · `DELETE /api/departments/:id/members/:memberId`.
- **Scope:** manage = admin; dept_leader read-only on own.

---

## 7. Cells (`/cells`)

```
┌ Cells ──────────────────────────────────────── [+ New] (admin) ┐
│ Dunamis   Lead: —      members: 410   [Open ▸]                  │
│ Moriah    Lead: …      members: 388   [Open ▸]                  │
│ Peniel    Lead: …      members: 442   [Open ▸]                  │
└─────────────────────────────────────────────────────────────────┘
Cell detail: roster + leader + attendance-rate snapshot
```
- **Page structure:** `/cells` (list) · `/cells/:id` (roster + leader + cell stats). Mirrors Departments.
- **Components:** `CellsPage → DataTable(CellRow)`; `CellDetailPage → CellHeader(LeaderSelect) → RosterTable → CellStatsCard`.
- **API:** `GET /api/cells` · `POST /api/cells` · `GET /api/cells/:id` · `PATCH /api/cells/:id` · `GET /api/cells/:id/members` (members are assigned via `members.cell_id`, edited on the member).
- **Scope:** manage = admin; cell_leader read-only on own.

---

## 8. Reports (`/reports`)

```
┌ Reports ─── [Date range ▾] [Cell ▾] [Dept ▾] [Gathering ▾] ── [⤓ CSV] [🖨] ┐
│ Report:  ( ● Membership roster  ○ Attendance summary  ○ New members        │
│           ○ Baptism coverage    ○ Residence split     ○ Absentee list )    │
├────────────────────────────────────────────────────────────────────────────┤
│  Rendered table / summary for the selected report + filters                │
└────────────────────────────────────────────────────────────────────────────┘
```
- **Page structure:** `/reports` with a report selector + filter bar; result table; export CSV / print. Pre-built reports: membership roster, attendance summary (by gathering/cell/dept), new members, baptism coverage, residence split, absentee watchlist.
- **Components:** `ReportsPage → ReportSelector + FilterBar + ReportTable + ExportButton`.
- **API:** `GET /api/reports/:type?range&cellId&departmentId&gatheringTypeId&format=json|csv` (one parameterized endpoint per report type).
- **Scope:** results auto-scoped for leaders.

---

## 9. Analytics (`/analytics`)

```
┌ Analytics ─── [Date range ▾] [Cell ▾] [Dept ▾] ───────────────────────────┐
│ [Membership growth ⤴]      [Attendance trend / gathering (multi-line)]     │
│ [Cell distribution 🍩]      [Department participation 📊]                   │
│ [Baptism coverage %]        [Visitor→Member funnel]   [Absentee watchlist] │
└────────────────────────────────────────────────────────────────────────────┘
```
- **Page structure:** `/analytics` — grid of chart cards + filters (date range, cell, department, gathering type). Interactive, drill-down where useful.
- **Components:** `AnalyticsPage → FilterBar + ChartGrid[ MembershipGrowthChart, AttendanceTrendChart, CellDistributionChart(Donut), DepartmentParticipationChart(Bar), BaptismCoverageCard, ConversionFunnelChart, AbsenteeWatchlist ]`.
- **API:** `GET /api/analytics/membership-growth` · `/attendance-trend` · `/cell-distribution` · `/department-participation` · `/baptism-coverage` · `/conversion-funnel` · `/absentees` (all accept `range,cellId,departmentId,gatheringTypeId`; KV-cached for hot ranges).
- **Scope:** leaders scoped; aggregates respect role.

---

## 10. Settings (`/settings`)

```
┌ Settings ── Tabs: ▸Lookups ▸Organization ▸QR ▸Users ▸Roles ▸Audit ─────────┐
│ Lookups:    Programmes · Departments · Cells · Gathering types (CRUD)       │
│ Organization: church name, academic year, feature flags                    │
│ QR:         printable QR → /register  [Download PNG/PDF]                    │
│ Users:      (super_admin) admin/leader accounts — create, suspend, role     │
│ Roles:      (super_admin) role → permission matrix (read-only v1)           │
│ Audit:      (super_admin) searchable audit_log                              │
└────────────────────────────────────────────────────────────────────────────┘
```
- **Page structure:** `/settings/:tab` — `lookups` (church_admin+), `organization` (church_admin+), `qr` (church_admin+), `users` · `roles` · `audit` (super_admin only).
- **Components:** `SettingsPage → SettingsTabs → [ LookupManager(programmes|departments|cells|gathering_types), OrgSettingsForm, QrCodePanel, UsersManager(UserTable, Invite/CreateUserDialog), RolePermissionMatrix, AuditLogViewer(FilterBar, DataTable) ]`.
- **API:**
  - Lookups: `GET/POST/PATCH /api/programmes` · `/departments` · `/cells` · `/gathering-types`.
  - Org: `GET/PATCH /api/settings`.
  - Users/Roles (super_admin): `GET/POST/PATCH /api/users` · `POST /api/users/:id/suspend` · `GET /api/roles`.
  - Audit (super_admin): `GET /api/audit?actor&entityType&action&range&page`.
  - QR: client-generates the QR from the public `/register` URL (no API).

---

## 11. API Surface Summary (by concern)

| Concern | Representative endpoints | Min role |
|---|---|---|
| Session/identity | `GET /api/me`, `POST /api/auth/login`, `POST /api/auth/logout` | self |
| Members | `GET/PATCH/DELETE /api/members*`, status, history, export | staff scope ▲ |
| Registrations | list, get, approve, reject, duplicate | church_admin |
| Attendance | sessions CRUD, roster, records bulk, close, check-in | scope ▲ |
| Departments/Cells | list/get/CRUD/roster | admin (manage), leader (read own) |
| Reports/Analytics | parameterized report + chart endpoints | scope ▲ |
| Settings·Lookups | programmes/departments/cells/gathering-types CRUD | church_admin |
| Settings·Admin | users, roles, audit | super_admin |

All endpoints: **authenticate (JWT) → authorize (role+scope) → validate (Zod) → service → audit**. Lists are paginated + filterable; scoped automatically for leaders (department/cell from the token, re-verified on writes).

---

## 12. Cross-Cutting UX & Technical Notes
- **Responsive:** desktop-first dashboard; tables degrade to cards on mobile; the Attendance "mark" screen is mobile-friendly for ushers.
- **Data:** TanStack Query caching + optimistic updates on attendance marking; TanStack Table for sorting/pagination; Recharts for charts.
- **States:** every list/section has loading skeletons, empty states, and error boundaries.
- **Accessibility:** keyboard nav, focus management in modals, `aria-live` for toasts, sufficient contrast (PENSA branding).
- **Permissions in UI:** nav + actions are hidden when not permitted, but the **server is authoritative** (UI hiding is convenience only).
- **Reuse:** this SPA shares the React shell, Tailwind/shadcn system, and Zod schemas with the public `/register` wizard.

---

## 13. Out of Scope (future)
Real-time presence, push notifications, bulk import, finance/volunteer/alumni dashboards (their schema seams already exist), and the mobile companion app.
