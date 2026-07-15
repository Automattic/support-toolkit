# Zendesk Enhancements — Integrating the four userscripts as modules

**Date:** 2026-07-15
**Author:** Mauro Pereira (with Claude)
**Status:** Approved for planning

## Goal

Fold the four Tampermonkey userscripts in `/Scripts` into the Support Toolkit
extension itself — as first-class modules, not injected scripts — with their
features toggleable from the extension Settings panel and active on Zendesk.

Source scripts:

- `zd-notes-sidebar.user.js` — stacks Notes above the User Info sidebar (CSS grid).
- `zd-site-tools-menu.user.js` — per-site "Tools ▾" dropdown inside the User Info app iframe.
- `zd-styling.user.js` — dark-mode iframe completion, resizable field boxes, wide messages, chat bubbles.
- `zd-workflow-helper.user.js` — Draft Mode default, merge-checkbox uncheck, Stay-on-ticket default, Messaging default.

## Guiding constraints (from project memory)

- **Privacy-first:** no customer data to third-party services. All four modules
  stay same-origin (Zendesk REST API) or emit local CSS. The Site Tools menu
  builds links to internal a8c tools that the agent opens by clicking — standard
  navigation, no data exfiltration.
- **UI consistency:** match the existing toolbar/settings style; no emojis; work
  across Zendesk pages; smooth UX.
- **Existing patterns:** config in `chrome.storage.sync` under `ZDCounter-config`
  (defaults in `constants.js`); `customizer-apply.js` is the template for
  CSS-based Zendesk enhancements (read config → inject `<style>` → live-refresh
  on `storage.onChanged`). Settings overlay built in `content.js`
  (`buildSettingsOverlay` / `loadSettingsForm` / `saveSettingsForm`).

## Decisions

- **Toggle granularity:** per sub-feature (matches how the scripts already gate
  themselves; most flexible for the agent).
- **Settings placement:** a new "Zendesk Enhancements" grouping in the Settings
  overlay, split into "Layout & Styling" and "Workflow automation".
- **Notes stacking:** do NOT ship the userscript as a second competing feature.
  Instead harden the existing single `stackSidebars` engine (see Module 1).

## Module 1 — Sidebar stacking (harden the existing engine)

### Problem found (live-verified 2026-07-15 on ticket 11438969)

The ticket grid is a **custom layout** (`data-test-id="ticket-<id>-custom-layout"`),
so pane order is configured per-agent and is **not guaranteed**. The current
`customizer-apply.js` hardcodes `Notes = column-1`, `Info = column-3`. When a
layout orders panes differently it stacks the wrong panes — the observed
inconsistency. The current engine also has no cap on notes height, so a long
note squashes the sidebar.

The userscript solved both: it identifies panes by **content** (the column that
contains the `a8cnotes` app / the `ContextPanel`) and caps the notes height. Its
downside is a heavier always-on `MutationObserver`.

### Approach

Keep the current engine's strengths (pure CSS placement, never moves DOM — this
is what protects the multi-tab app-iframe integrity; the userscript's own
history shows DOM-moving caused a cross-tab bug) and adopt the userscript's two
robustness wins:

1. **Content-based pane tagging.** A small, debounced, idempotent observer finds,
   per ticket grid, the column containing the `a8cnotes` app (fallback to the
   column whose text matches `/a8cnotes/i` before the iframe lazy-loads) and the
   column containing `[data-test-id="component-type-ContextPanel"]`; the third is
   the conversation. It sets `data-zd-pane="notes|info|conversation"` on each.
   Bails when the tags are already correct (no churn).
2. **CSS keys off the tags, not `column-N`.** The grid-placement rules target
   `[data-zd-pane="..."]`, so the layout is correct regardless of column order.
3. **Notes height cap** so a long note scrolls instead of squashing the sidebar.

Preserve: the single `stackSidebars` setting (`off | right | left`), the
draggable divider and `stackTopPx` persistence, `document_start` injection,
and live-refresh on `storage.onChanged`.

## Module 2 — Site Tools menu

New file `site-tools-menu.js`, injected via a **new manifest content-script
block** matching the User Info app origin `https://126740.apps.zdusercontent.com/*`
(the app is cross-origin from `a8c.zendesk.com`). Ports the userscript verbatim
in behavior: anchor on each site row's "Blog RC" link, derive `blogId`/`domain`,
append a "Tools ▾" toggle opening a dropdown of internal-tool links.

- Content scripts can use `chrome.storage` regardless of origin, so the module
  reads the `siteToolsMenu` flag directly and re-runs on `storage.onChanged`
  (adds/removes toggles live).
- `run_at: document_idle`. MutationObserver keeps toggles present across app
  re-renders (already in the script). Drop the `DEBUG`/`postMessage` diagnostics.

## Module 3 — Styling

New file `zd-styling.js` on the Zendesk top page (`document_idle`, needs `body`).
Ports the four sub-features, each independently toggleable:

- `stylingDarkMode` — invert-filter dark-mode completion for app iframes.
- `stylingResizeBoxes` — vertical resize on multiline ticket fields.
- `stylingWideMessages` — full-width conversation messages.
- `stylingChatBubbles` — chat bubbles + the article role classifier.

The classifier fetches `/api/v2/users/{id}.json` **same-origin** (agent session
cookie); no new permissions, no third-party. The classifier's `MutationObserver`
only runs when `stylingChatBubbles` is on. De-duplicate the message-width rule
shared by the wide-messages and chat-bubbles CSS. Read config, inject one
`<style>` per enabled sub-feature, live-refresh on `storage.onChanged`.

## Module 4 — Workflow helper (main world)

The script needs `window.LotusReact`, which lives in the page's **main world** —
unreachable from an isolated content script. Split into two files:

- `workflow-helper.js` — the ported logic, injected with `"world": "MAIN"` in a
  dedicated manifest block (Zendesk matches, `document_idle`). Main-world scripts
  can't touch `chrome.*`, so it receives its feature flags via a `CustomEvent`
  (`zd-workflow-config`) on `document` and applies them; it re-applies when a new
  event arrives (live toggle).
- `workflow-helper-bridge.js` — a tiny **isolated-world** content script (idle
  block) that reads `chrome.storage` and dispatches `zd-workflow-config` with the
  flags, both on load and on every `storage.onChanged`.

Sub-features (each a flag): `wfDraftMode`, `wfMergeUncheck`, `wfStayOnTicket`,
`wfMessagingDefault`. Keep the Ctrl+Enter send-without-draft hotkey with
`wfDraftMode`. Drop the DEBUG logging path (keep `warn`).

## Configuration keys (add to `DEFAULT_CONFIG` in `constants.js`)

```
// Site Tools
siteToolsMenu: true,

// Styling
stylingDarkMode: true,
stylingResizeBoxes: true,
stylingWideMessages: true,
stylingChatBubbles: true,

// Workflow helper
wfDraftMode: true,
wfMergeUncheck: true,
wfStayOnTicket: true,
wfMessagingDefault: true,
```

`stackSidebars` / `stackTopPx` already exist.

## Settings UI (`content.js`)

New "Zendesk Enhancements" content in `buildSettingsOverlay`:

- **Layout & Styling:** existing "Stack sidebars" dropdown moves here; add checks
  for Site Tools menu, Dark-mode fix, Resize boxes, Wide messages, Chat bubbles.
- **Workflow automation:** checks for Draft Mode, Merge uncheck, Stay on ticket,
  Messaging default.

Wire each into `loadSettingsForm` (populate; all default true) and
`saveSettingsForm` (read → `ZDStorage.setConfig`). Follow the existing `.cfg-*`
class convention.

## Manifest changes

- **document_start block:** unchanged (`zendesk-selectors.js`, upgraded
  `customizer-apply.js`).
- **document_idle block (isolated, Zendesk matches):** add `zd-styling.js` and
  `workflow-helper-bridge.js` (before `content.js`).
- **New block — MAIN world, Zendesk matches, `document_idle`:** `workflow-helper.js`
  with `"world": "MAIN"`.
- **New block — `https://126740.apps.zdusercontent.com/*`, `document_idle`:**
  `site-tools-menu.js`.

## Testing

Live-verify each module on ticket 11438969 after building (Tampermonkey scripts
disabled to avoid double-application):

1. Stacking correct under the custom layout; divider drags; long note scrolls.
2. Site Tools "Tools ▾" appears per site row; links resolve; toggle add/remove.
3. Each styling sub-feature visibly toggles; dark mode; bubbles classify.
4. Draft Mode auto-on; merge uncheck; Stay-on-ticket default; messaging default;
   Ctrl+Enter still sends.
5. All toggles persist across reload and live-apply without reload where feasible.

## Out of scope

- No new external network calls or permissions beyond the app-iframe content
  match.
- No redesign of the existing toolbar/counters.
- The dormant `customizer.js` panel is not revived; controls live in Settings.
