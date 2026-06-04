# PENSA GCTU CMS — Member Registration Module

**Status:** Proposed (architecture only — no code) · **Date:** 2026-06-04
**Route:** `/register` (public, unauthenticated) · **Outcome:** a `registrations` row with status **Pending Approval**
**Pipeline:** Visitor → QR `/register` → **Pending Approval** → Admin Approval → Member Record (`PENSA-YYYY-NNNN`)

This is the public intake step. It creates a **registration**, never a member or an account (members don't authenticate). Approval (separate module) converts an approved registration into a member.

---

## 1. Data Collected → Schema Mapping

| Form field | Type | Maps to | Notes |
|---|---|---|---|
| Full Name | text (first / last / other) | `members.first_name/last_name/other_names` | captured as 3 inputs; `full_name` is generated |
| Date of Birth | date | `members.date_of_birth` | min/max age sanity bounds |
| Programme | select (lookup) | `members.programme_id` | from `programmes` (39 seeded) |
| Residence Type | radio | `members.residence_status` | `hostel_resident` \| `non_resident` |
| Vacation Residence | text | `members.residence_during_vacation` | |
| Department | multi-select (lookup) | `member_departments` (M:N) | from `departments` (5) |
| Cell | select (lookup) | `members.cell_id` | Dunamis \| Moriah \| Peniel |
| Holy Ghost Baptism | toggle (+date) | `members.holy_ghost_baptism(_date)` | |
| Water Baptism | toggle (+date) | `members.water_baptism(_date)` | |
| Active Phone Number | tel | `members.phone_number` | normalized E.164; **duplicate key** |
| WhatsApp Number | tel | `members.whatsapp_number` | "same as phone" shortcut |
| Membership Status | radio | `members.membership_status` | self-declared; admin confirms on approval |
| Gathering Type | select (lookup) | `members.primary_gathering_type_id` *(new col)* | "which gathering do you attend?" |
| Profile Picture | image | `members.profile_picture_key` (R2) | optional; uploaded to draft first |

> **Decision — Membership Status:** collected as *self-declared* (Visitor/Associate/etc.). On approval the admin confirms or overrides; if untouched, the system default remains `visitor`. The registrant's choice is stored for the admin to see, not auto-trusted.

---

## 2. Backend Architecture (Hono on Workers)

### 2.1 Endpoints

All under `/register*`; the existing rate-limit rule (`register`, 10/h/IP) covers the final submit, with gentler limits on draft/image helpers.

| Method | Route | Purpose | Auth | Rate limit |
|---|---|---|---|---|
| GET | `/register` | Serve the SPA (static) | public | — |
| GET | `/register/options` | Dropdown data: programmes, departments, cells, gathering types | public | light (cached) |
| POST | `/register/draft` | Create/upsert a draft (by draft-token cookie) | public | 60/h/IP |
| GET | `/register/draft` | Resume an existing draft | public | light |
| POST | `/register/image` | Upload profile image → R2 (draft-scoped) | public | 20/h/IP |
| DELETE | `/register/image` | Remove the uploaded draft image | public | light |
| POST | `/register` | **Final submit** → validate, dedupe, status=pending | public + Turnstile | **10/h/IP** |

Every handler: rate-limit → (Turnstile on submit) → Zod validate → service → audit.

### 2.2 Draft model & resume ("Save draft capability")

Two layers:
- **Client autosave** (localStorage, debounced) — survives refresh/navigation instantly, no network.
- **Server draft** (durable, enables image attachment + cross-device resume):
  - First field change → `POST /register/draft` creates a `registrations` row with **`status='draft'`** and a random **`draft_token`**, returned as a **non-HttpOnly cookie** `pensa_reg_draft` (so the SPA can resume).
  - Subsequent saves upsert the same row by token. Uploaded images attach to this draft.
  - **Final submit** flips `status` `draft → pending`, clears the cookie, and records `submitted_at`.
  - Abandoned drafts (status='draft', older than N days) are purged by a scheduled cleanup (Cron Trigger) — and their R2 draft images deleted.

### 2.3 Profile image pipeline (R2)

- **Upload through the Worker** (not presigned) so we can validate before storing:
  - accept `image/jpeg|png|webp`, **magic-byte** check (not just content-type), max ~5 MB (client pre-compresses, see frontend);
  - store at `registrations/drafts/<draft_token>/<uuid>.<ext>`; return `{ key, previewUrl }`.
  - `previewUrl` is a short-lived signed GET (Worker-proxied) — the bucket stays private.
- **On approval**, the object is copied/moved to `members/<member_id>/avatar.<ext>` and `members.profile_picture_key` is set; draft objects are GC'd.
- Optional later: client requests Cloudflare Image Resizing for thumbnails (deferred; plain R2 now).

### 2.4 Validation

- **Zod schemas, shared shape** between client and server (server is source of truth):
  - a **per-step** schema (validate before "Next") and a **full** schema (validate on submit);
  - phone normalized to E.164 (Ghana default +233), DOB bounded, required-field enforcement, enum checks against live lookups.
- Server re-validates the entire payload on submit regardless of client state.

### 2.5 Duplicate detection

Runs **server-side at submit** (privacy-preserving — never reveals member data to the public form):
- **Signals computed:**
  - **Exact phone** match against live `members.phone_number` and pending `registrations.phone_number`;
  - **Name + DOB** match (normalized `full_name` + `date_of_birth`);
  - (optional) fuzzy name match (trigram/Levenshtein) for typos.
- **Behavior:** the submission is **always accepted** (no enumeration leak, no public block). If signals fire, the registration is flagged — `possible_duplicate=1` + `duplicate_of_member_id` / `duplicate_signals` JSON — so it surfaces in the **admin approval queue** with a "possible duplicate" badge for human resolution.
- Rate limiting + Turnstile prevent using the form as an enumeration oracle.

> **Decision — dedupe is advisory, not blocking.** A visitor is never told "you already exist." The admin decides at approval. This avoids privacy leaks and avoids false-positive lockouts.

### 2.6 Proposed data-model additions (design — applied when we build)

```sql
-- registrations: structured columns for dedupe/listing + draft + image
ALTER TABLE registrations ADD COLUMN draft_token TEXT;            -- resume key (status='draft')
ALTER TABLE registrations ADD COLUMN full_name   TEXT;            -- for dedupe/queue display
ALTER TABLE registrations ADD COLUMN phone_number TEXT;
ALTER TABLE registrations ADD COLUMN date_of_birth TEXT;
ALTER TABLE registrations ADD COLUMN profile_image_key TEXT;     -- R2 draft key
ALTER TABLE registrations ADD COLUMN possible_duplicate INTEGER NOT NULL DEFAULT 0;
ALTER TABLE registrations ADD COLUMN duplicate_of_member_id TEXT REFERENCES members(id);
ALTER TABLE registrations ADD COLUMN duplicate_signals TEXT;     -- JSON
-- widen status to include 'draft'
--   status IN ('draft','pending','approved','rejected')   (rebuild CHECK in migration)
CREATE UNIQUE INDEX ux_registrations_draft_token ON registrations(draft_token) WHERE draft_token IS NOT NULL;
CREATE INDEX ix_registrations_phone ON registrations(phone_number);

-- members: primary gathering preference (collected at registration)
ALTER TABLE members ADD COLUMN primary_gathering_type_id TEXT REFERENCES gathering_types(id) ON DELETE SET NULL;
```
`payload` JSON still holds the complete submission; the new columns are the queryable/dedupe subset.

### 2.7 Submit flow

```
POST /register  {fields…, draftToken, turnstileToken}
  → rate-limit (10/h/IP) → Turnstile verify
  → Zod full-validate (against live lookups)
  → duplicate detection → compute signals
  → upsert registration: status pending, copy structured cols, attach image key,
       set possible_duplicate/duplicate_* , submitted_at
  → clear draft cookie
  → audit: registration.submitted
  → 200 { reference: REG-<short>, status: "pending_approval" }
```

---

## 3. Frontend Architecture (React SPA, mobile-first)

### 3.1 Stack
- **React + Vite** SPA, served as **static assets via the Worker**; the form is public.
- **Tailwind CSS + shadcn/ui** (design system), **react-hook-form + @hookform/resolvers/zod** (forms/validation), **TanStack Query** (options + draft fetch/mutate), a small **wizard reducer/Context** for step state.
- Shared **Zod schemas** imported from a common package so client/server validation can't drift.

### 3.2 Multi-step wizard

Mobile-first, one logical group per step, sticky footer nav, top progress bar:

| Step | Title | Fields |
|---|---|---|
| 1 | Welcome / Personal | Full Name, Date of Birth, **Profile Picture** |
| 2 | Academic & Residence | Programme, Residence Type, Vacation Residence |
| 3 | Church Life | Department(s), Cell, Gathering Type, Membership Status |
| 4 | Spiritual | Holy Ghost Baptism (+date), Water Baptism (+date) |
| 5 | Contact | Active Phone, WhatsApp ("same as phone" toggle) |
| 6 | Review & Submit | Read-only summary + Turnstile + Submit |

- **Per-step validation:** "Next" disabled until the step's Zod slice passes; inline field errors.
- **Progress + resumability:** step index persisted; refresh resumes where you left off.

### 3.3 State, autosave & resume
- Wizard state in Context/reducer; **debounced autosave** to **localStorage** on every change and a **server draft sync** on each step advance (`POST /register/draft`).
- On revisit, if a draft cookie/localStorage exists → **"Resume your registration?"** prompt (Resume / Start over).
- Network-resilient: localStorage keeps data if the device goes offline mid-form.

### 3.4 Profile image UX
- `<input type="file" accept="image/*" capture="user">` → opens **camera on mobile**.
- **Client-side compress/resize** (canvas → ~1024px, WebP/JPEG, target <1 MB) before upload — saves bandwidth and R2 storage.
- Optional square **crop**; live **preview**; upload to `/register/image` with progress; replace/remove.
- Image is **optional** (registration succeeds without it).

### 3.5 Validation UX
- Inline, on-blur + on-submit; phone formatted as typed; friendly messages; `inputmode="tel"`/`numeric` for mobile keyboards; date picker with sensible bounds.

### 3.6 Duplicate handling (frontend)
- No live "you already exist" check (privacy). The form simply confirms submission; duplicate resolution is the admin's job. (Optional gentle nudge: a non-blocking "Make sure you haven't registered before" reminder on the contact step.)

### 3.7 Mobile-first design system
- Single-column, large 44px+ tap targets, sticky **Back / Next** footer, thumb-reachable controls, big readable type, high-contrast, PENSA branding.
- Works as a **QR-code landing**: scanning the church's QR opens `/register` directly.

### 3.8 Accessibility
- Semantic steps with `aria-current`, labeled inputs, focus management on step change, error summaries announced via `aria-live`, keyboard-navigable, respects reduced-motion.

### 3.9 Submission & confirmation
- On success: a **confirmation screen** with the reference (`REG-…`), a "Pending Approval" message, and what happens next. Draft cleared.

### 3.10 Component tree (sketch)
```
<RegisterPage>
  <ResumePrompt/>                      // if draft exists
  <WizardProvider>                     // reducer: step, values, status
    <StepProgress/>                    // bar + step labels
    <StepContainer>
      Step1Personal   (NameFields, DatePicker, ImageUpload)
      Step2Academic   (ProgrammeSelect, ResidenceRadio, VacationInput)
      Step3Church     (DepartmentMultiSelect, CellSelect, GatheringSelect, StatusRadio)
      Step4Spiritual  (BaptismToggle x2)
      Step5Contact    (PhoneInput, WhatsappInput)
      Step6Review     (ReviewSummary, Turnstile, SubmitButton)
    </StepContainer>
    <WizardFooter/>                    // Back / Next / Submit
  </WizardProvider>
  <ConfirmationScreen/>                // post-submit
```

---

## 4. End-to-End Sequence (happy path)

```
QR scan → GET /register (SPA) → GET /register/options (dropdowns)
  ↓ user fills Step 1 → autosave(localStorage) + POST /register/draft (token cookie)
  ↓ uploads photo → POST /register/image → R2 draft key + preview
  ↓ Steps 2–5 (per-step validate, draft sync)
  ↓ Step 6 Review → Turnstile → POST /register
       server: validate → dedupe → status=pending → audit → REG ref
  ↓ ConfirmationScreen ("Pending Approval", REG-2026-XXXX)
Admin later: approval queue (with possible-duplicate badges) → approve → member + PENSA code
```

---

## 5. Security & Abuse Controls (reuse existing)
- **Rate limiting** (RateLimiter DO) on submit/draft/image; **Turnstile** on submit.
- Private R2 (signed preview URLs only); magic-byte image validation; size caps.
- Server-authoritative Zod validation; enumeration-safe dedupe; audit logging.
- Abandoned-draft + orphan-image cleanup via Cron Trigger.

---

## 6. Decisions & Open Questions

**Decisions made (flag if you disagree):**
1. Dedupe is **advisory** (admin-resolved), never blocks the public submitter.
2. Membership Status & Gathering Type are **self-declared**, admin-confirmed on approval.
3. Images upload **through the Worker** (validated), bucket stays private.
4. Draft = **localStorage autosave + server draft** (token cookie) for resume.

**Open questions for you:**
- **A.** Profile picture: keep **optional** (recommended), or required?
- **B.** Multi-step grouping: 6 steps as above, or condense to **4**?
- **C.** Should a registrant pick **one** department or **multiple**? (schema supports many)
- **D.** Reference number shown to visitors — keep (`REG-2026-XXXX`) or omit?

---

## 7. Out of Scope (next module)
Admin **Approval queue** (review, possible-duplicate resolution, approve→member with `PENSA-YYYY-NNNN`, image promotion to `members/…`). Designed separately.
