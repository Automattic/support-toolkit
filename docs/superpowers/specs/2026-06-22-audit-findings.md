# Support Toolkit — Code Audit Findings (2026-06-22)

Read-only audit of all 25 extension files. Grouped by severity. Status column tracks what I (Claude) did this session.

> Testing constraint: counting logic (auto-count / resolution detection) cannot be verified without resolving real tickets, which Mauro prohibited. Those items are **documented, not changed**, pending a session with explicit test approval.

## HIGH
- **H1 — `auto-count.js` is dead code.** `ZDAutoCount.init()` is never called; content.js reimplements resolution-counting inline (content.js:54,60,4150,4167,4214-4263). Two sources of truth. *Status: documented (counting — not changed).* 
- **H2 — 60s same-ticket dedup isn't actually running.** The documented v2.9/3.0 dedup lives only in the dead auto-count.js (per-ticket, 60000ms). The ACTIVE path (content.js:4167-4173) uses a single global `lastIncrementTime` with **800ms** debounce → different tickets resolved within 800ms lose a count; same-ticket 60s dedup absent. *Status: documented (counting — not changed).*
- **H3 — Late-login shift warning can never fire.** `timers.js:276-287` checks `diffSinceStart = now - nextShift.start > 0`, but `getShiftState()` only sets `nextShift` when `start > now`, so it's always negative. The `lateLoginWarning*` setting has no effect. *Status: **FIXING this session** (tied to the shift-warning feature I shipped).* 
- **H4 — Settings save aborts entirely if any one input selector is missing.** content.js saveSettingsForm (~1709-1741) does ~20 unguarded `.checked/.value` reads; one missing class throws and loses ALL settings. *Status: candidate fix (testable via Settings modal).*
- **H5 — `calendar.google.com` accepted but not in host_permissions.** config.js:132-133 validates it, manifest.json only grants happy.tools + linear → Google Calendar ICS fetch silently blocked. *Status: candidate fix (low risk).*

## MEDIUM
- **M1 — Two 1s interval loops** (timers.js ticker + timer-manager mainLoop) run together; timer-manager claimed to replace setInterval but timers.js ticker remains. *Documented.*
- **M2 — Zendesk selectors duplicated across 4 files** (constants.js:96-101, config.js:56-69, auto-count.js, content.js); active listeners hardcode strings. New `zendesk-selectors.js` (this session) is the intended home — migration is Track B. *Documented.*
- **M3 — Fragile generated class `.StyledValue-sc-1vb3zxh-1`** (auto-count.js:29, dead). *Documented.*
- **M4 — Three overlapping day-rollover implementations** with different keys (storage.js UTC live path; schedule.js:169-213 + 232-252; content.js copy) → possible double-archive. *Documented.*
- **M5 — Unescaped `innerHTML` interpolation in linear-panel.js** (~1041-1078, 1118-1124) despite `escapeHtml()` existing (~1223). Linear API data. *Candidate fix.*
- **M6 — Document click listeners stack without cleanup** (linear-panel.js ~361; notes.js:154-171 re-add on each open). *Candidate fix.*
- **M7 — Linear team input not debounced** (linear-panel.js ~340); `ZDUtils.debounce` exists unused. *Candidate fix.*
- **M8 — Theme key duality** (theme-presets writes currentTheme/currentSize/theme, reads currentTheme + legacy theme). Works via fallbacks. *Documented.*
- **M9 — Unguarded `.value` reads in export modal** (export.js ~314-337). *Candidate fix.*

## LOW
- L1 — notes.js init()/cleanup() dead (reminders run via timer-manager). L2 — notification-utils.js:35 innerHTML sink. L3 — SHIFT_TIMING defaults duplicate constants.js; notifications.js hardcodes "~5/10 min" strings (drift). L4 — background.js onMessage stub. L5 — export.js anchor.click() without DOM append. L6 — verbose console.log in storage.js/auto-count.js. L7 — content.js injects global `<meta viewport>` into Zendesk (page-wide side effect).

## Solid / confirmed good
preShiftWarningMinutes→startShiftWarningMinutes now consistent end-to-end (incl. storage.js migration). No MutationObserver leaks. Drag handler attaches/detaches per-drag correctly. Privacy posture intact (only Linear keyword strings leave; transcript processed locally; LibreChat is an iframe to chat.a8c.com).
