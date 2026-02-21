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
| — | — | — | — | — |

---

## Issue Index

| ID | Type | Title | Severity/Priority | Status | Area |
|----|------|-------|-------------------|--------|------|
| DEF-001 | Defect | _(example)_ | — | Open | — |
| ENH-001 | Enhancement | Creating log using voice along with type | Should Have | In Progress | Chat |

---

*Last updated: 2026-02-21*
