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

### DEF-001 — [Short title]

| Field | Value |
|-------|-------|
| **Date** | YYYY-MM-DD |
| **Reported by** | Name |
| **Severity** | Critical / High / Medium / Low |
| **Status** | Open |
| **Phase** | Phase 1 / Phase 2 |
| **Area** | Chat / Dashboard Strip / Activities Page / Analytics / Notifications / Brain Sharing / Settings / Auth |
| **Feature** | e.g. Recurring Auto-creation |

**Steps to Reproduce**

1. Step one
2. Step two
3. Step three

**Expected Behaviour**

What should happen.

**Actual Behaviour**

What actually happens (include error messages, screenshots if applicable).

**Environment**

- Browser: Chrome 123 / Firefox / Safari
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

### ENH-001 — [Short title]

| Field | Value |
|-------|-------|
| **Date** | YYYY-MM-DD |
| **Requested by** | Name |
| **Priority** | Must Have / Should Have / Nice to Have |
| **Status** | Proposed |
| **Target Phase** | Phase 3 / Phase 4 / Backlog |
| **Area** | Chat / Dashboard Strip / Activities Page / Analytics / Notifications / Brain Sharing / Settings / Auth / Infrastructure |

**Problem / Motivation**

What user pain point does this solve? Why does it matter?

**Proposed Solution**

Describe the desired behaviour from the user's perspective.

**Acceptance Criteria**

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

**Technical Notes (optional)**

Hints on implementation approach, affected files, DB changes needed, etc.

**Out of Scope**

What this enhancement explicitly does NOT include.

---

## Closed Issues

> Move resolved defects and shipped enhancements here with their final status and fix/release reference.

| ID | Type | Title | Resolution | Date Closed |
|----|------|-------|-----------|-------------|
| — | — | — | — | — |

---

## Issue Index

| ID | Type | Title | Severity/Priority | Status | Area |
|----|------|-------|-------------------|--------|------|
| DEF-001 | Defect | _(example)_ | — | Open | — |
| ENH-001 | Enhancement | _(example)_ | — | Proposed | — |

---

*Last updated: 2026-02-21*
