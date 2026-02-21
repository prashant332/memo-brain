# MemoBrain — Issue & Enhancement Tracker

> Use this file to log defects found during testing and enhancement requests for future phases.
> Keep entries in reverse-chronological order (newest at top) within each section.

---

## Product Baseline

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Chat logging, Dashboard Strip, Session history, Settings, Multi-provider AI | ✅ Released |
| Phase 2 | Activity Management UI, Recurring Auto-creation, Real DB Query Engine, Analytics, Notifications, Brain Sharing | ✅ Released |

**Core terminology** (match these exactly in issue descriptions):

| Term | Meaning |
|------|---------|
| Activity | Template — e.g. "Electricity Bill" (monthly recurring) |
| Activity Log | A timestamped instance of an Activity |
| Session | A single chat conversation |
| Period | Billing/tracking month in `YYYY-MM` format |
| Dashboard Strip | The status bar above the chat showing bills/overdue/events/upcoming |
| Brain | The full set of a user's activities and logs |
| Shared Brain | A brain visible to another user via Brain Sharing |

---

## Defect Reports

<!--
  Copy the template below for each new defect.
  Severity: Critical | High | Medium | Low
  Status: Open | In Progress | Fixed | Won't Fix | Duplicate
-->

---

### DEF-001 — Asking to enter the amount manually even though the initial log entry contains the amount data

| Field | Value |
|-------|-------|
| **Date** | 2026-02-21 |
| **Reported by** | Prashant |
| **Severity** |  High  |
| **Status** | Fixed |
| **Phase** | Phase 2 |
| **Area** | Chat  |
| **Feature** | Log interpretation and entry |

**Steps to Reproduce**

1. While entering the chat like "Thank you for using LIC's Online facility for Renewal Payment. We have received an amount of Rs.23,743.00 vide Transaction ID 42224331 dated 20/02/2026." it is not captured the amount and asked me to enter the amount manually. the additional data should be asked only for the missing details.

**Expected Behaviour**

Amount, transaction ID, and date should be extracted automatically from the message. The metadata form should not appear if all key details are already present.

**Actual Behaviour**

The metadata form always appeared after logging, asking the user to re-enter the amount even though it was clearly stated in the message.

**Environment**

- Browser: Chrome 123 / Firefox / Safari
- Device: Desktop / Android (PWA)

**Root Cause (filled in by developer)**

The AI system prompt unconditionally instructed the AI to set `ask_followup: true` after every log action, regardless of whether the data was already present in the user's message. Additionally, the `MetadataForm` component had no way to receive pre-extracted metadata, so it always rendered as an empty form.

**Fix Applied**

- `backend/src/services/ai.js` — Made `ask_followup` conditional: only `true` when key fields (amount for bills, date for events) are genuinely missing. Added explicit currency parsing instructions for Indian/international formats (e.g. `Rs.23,743.00`).
- `frontend/src/components/MessageBubble.jsx` — Passes `action.metadata` as `initialValues` to `MetadataForm`.
- `frontend/src/components/MetadataForm.jsx` — Added `initialValues` prop to pre-populate form fields with AI-extracted data.

---

### DEF-002 — The Activities Page is not mobile friendly. It just lists the activities, but the right side details are not available in mobile. Possibly needs a fix to be able to view it mobile.

| Field | Value |
|-------|-------|
| **Date** | 2026-02-21 |
| **Reported by** | Prashant |
| **Severity** | High |
| **Status** | Fixed |
| **Phase** | Phase 2 |
| **Area** | Activities |
| **Feature** | Activities Page layout |

**Steps to Reproduce**

1. Open the Activities page on a mobile device or narrow viewport.
2. Tap any activity in the list.
3. The right-side detail panel (history, edit, deactivate) is not visible or accessible.

**Expected Behaviour**

Tapping an activity should show its full detail view (history, edit/deactivate buttons). On desktop both panels remain side by side.

**Actual Behaviour**

The page used a fixed two-column flex layout (`w-80` list + `flex-1` detail). On mobile both panels were squeezed together and the detail panel was effectively hidden or inaccessible.

**Environment**

- Browser: Chrome / Firefox / Safari
- Device: Android (PWA) / Mobile browser

**Root Cause (filled in by developer)**

The layout used a hardcoded `flex` row with `w-80` for the list panel and `flex-1` for the detail panel, with no responsive breakpoints. On narrow screens both panels rendered side by side, making the detail panel unreachable.

**Fix Applied**

- `frontend/src/pages/ActivitiesPage.jsx` — Added `mobileView` state (`'list'` | `'detail'`). On mobile, only one panel is visible at a time (toggled via `hidden`/`flex`/`block` with `md:` overrides). Added a back chevron button (mobile-only, `md:hidden`) in the detail header to return to the list. `handleDeactivate` now also resets `mobileView` to `'list'`. Header labels ("Show inactive", "Add Activity" text) hidden on xs to prevent overflow.

---

### DEF-003 — _(short title)_

| Field | Value |
|-------|-------|
| **Date** | YYYY-MM-DD |
| **Reported by** | Name |
| **Severity** | Critical \| High \| Medium \| Low |
| **Status** | Open |
| **Phase** | Phase 1 \| Phase 2 \| Phase 3 |
| **Area** | Chat \| Dashboard \| Activities \| Settings \| Auth |
| **Feature** | _(feature name)_ |

**Steps to Reproduce**

1.

**Expected Behaviour**

What should happen.

**Actual Behaviour**

What actually happens (include error messages, screenshots if applicable).

**Environment**

- Browser: Chrome / Firefox / Safari
- Device: Desktop / Android (PWA)
- Backend log output (if relevant): paste snippet

**Root Cause (filled in by developer)**

_Leave blank until investigated._

**Fix Applied**

_File(s) changed, commit reference, or PR link._

---

## Enhancement Requests

<!--
  Copy the template below for each new enhancement.
  Priority: Must Have | Should Have | Nice to Have
  Status: Proposed | Approved | In Progress | Done | Deferred
-->

---

### ENH-001 — Creating log using voice along with type

| Field | Value |
|-------|-------|
| **Date** | 2026-02-21 |
| **Requested by** | Prashant |
| **Priority** | Should Have |
| **Status** | In Progress |
| **Target Phase** | Phase 3 |
| **Area** | Chat |

**Problem / Motivation**

Typing can be hastle at times and may lead to giving insufficient data while logging. 

**Proposed Solution**

So it will be helpful to allow user to talk to the memo brain to create a log. So it should recognize the voice, and convert to text and confirm from user about correctness before processing the data and log.

Add a user friendly mic icon to tal and record message to convert to text and process from user along with ability to type and send.

**Acceptance Criteria**

- [ ] Accurate voice recognition and converting to text
- [ ] Seemless processing of the text and integrate with existing features
- [ ] Seemless void integration even for querying

**Technical Notes (optional)**

Please propose and updated based on the rquirement

**Out of Scope**


---

## Closed Issues

> Move resolved defects and shipped enhancements here with their final status and fix/release reference.

| ID | Type | Title | Resolution | Date Closed |
|----|------|-------|-----------|-------------|
| DEF-001 | Defect | Asking to enter amount manually even though initial log contains it | Fixed | 2026-02-21 |
| DEF-002 | Defect | Activities Page not mobile friendly — detail panel inaccessible on mobile | Fixed | 2026-02-21 |

---

## Issue Index

| ID | Type | Title | Severity/Priority | Status | Area |
|----|------|-------|-------------------|--------|------|
| DEF-001 | Defect | Asking to enter amount manually even though initial log contains it | High | Fixed | Chat |
| DEF-002 | Defect | Activities Page not mobile friendly — detail panel inaccessible on mobile | High | Fixed | Activities |
| DEF-003 | Defect | _(next defect)_ | — | Open | — |
| ENH-001 | Enhancement | Creating log using voice along with type | Should Have | In Progress | Chat |

---

*Last updated: 2026-02-21*
