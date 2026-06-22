# Zendesk Customizer — Build Progress Tracker

> Durable progress log for the autonomous build session (2026-06-22). Survives context summarization.
> Spec: `2026-06-22-zendesk-customizer-design.md`. Branch: `feature/zendesk-customizer`.

## Hard constraints (from Mauro)
- **Zendesk browser = UI ONLY.** Never send messages, apply macros, submit/change tickets, type in composer, or affect any ticket/chat/user. Inspection + CSS injection + screenshots only.
- Privacy-first: CSS/DOM only, no customer data read/stored/sent.
- No emojis in UI. Match toolbar styling. Works on every Zendesk page.

## Decisions (locked)
- Theming depth: **A — curated surfaces**.
- Anti-flash: inject appearance CSS at **document_start** (separate early style) — YES.
- Track B (broad hardening) = separate follow-up after Customizer ships.
- Build order: vertical slices, each browser-tested.

## Build slices
- [x] **Slice 0 — Foundations**: `zendesk-selectors.js` (single source of truth + helpers: isTicketPage, getTicketGrid, getPanes, smokeCheck). Manifest wiring (document_start entry).
- [x] **Slice 1 — Layout reorder**: per-pane position + width on `.ticket-panes-grid-layout` / `[data-test-id^="column-"]`. Presets. Verified live (swap sidebars worked cleanly).
- [x] **Slice 2 — Theming (all pages)**: maps `--zd-*` onto curated surfaces (body bg, navigation.main, header accent border). Verified live.
- [x] **Slice 3 — Text & Density**: conversation font/size/density. Verified live (serif/large/compact).
- [x] **Slice 4 — Hide/Show**: curated safe targets (macro bar, SLA badge, subject, search, notifications). Verified (SLA hide + macro selector corrected).
- [x] **Menu UI** (`customizer.js`): 4 tabs floating panel, matches toolbar styling, no emojis. Visual verified via injected prototype (stacked layout rows).
- [x] **Applier** (`customizer-apply.js`): pure `buildCustomizerCSS(settings)` + injector + storage.onChanged live-update. NOTE: route observer NOT needed — every rule self-scopes by selector, so one stylesheet works on all pages and re-matches on SPA nav automatically.
- [x] Storage model `config.customizer = {...}` (default in constants.js; survives getConfig merge).
- [ ] Code review (agents) + fixes — IN PROGRESS.
- [x] CHANGELOG updated; H3 fix committed; Customizer commit next.

## ⚠️ NEEDS RELOAD SMOKE-TEST (couldn't reload extension while Mauro AFK)
The CSS-generation engine + menu visuals were verified by injecting into the live page (no reload). Still to confirm after `chrome://extensions` reload:
1. Toolbar "Customize Zendesk" button appears (new `customize` icon) and opens the panel.
2. document_start applier injects on first paint (no flash) and on every page (Home/Views/ticket).
3. Saving a setting persists + live-applies via storage.onChanged.
4. Theme/Size selects in the Theme tab drive ZDThemePresets correctly.

## Verified Zendesk DOM facts (live)
- Ticket grid: `div.ticket-panes-grid-layout` (`[data-test-id$="-custom-layout"]`), `display:grid`, 3 tracks.
  - `[data-test-id="column-1"]` = Apps pane (a8cnotes), `[data-test-id="column-2"]` = Conversation, `[data-test-id="column-3"]` = Context/User Info. Each `data-garden-id="pane"`.
- Persistent chrome (all pages): `header[data-test-id="header-toolbar"]` (`data-garden-id="navigation.header"`), `nav[data-test-id="header-tablist"]`, `main[data-garden-id="navigation.main"]`. body bg rgb(21,26,30) dark.

## Extension theme system
- `theme-presets.js`: 4 themes x light/dark + 4 sizes → sets ~29 `--zd-*` vars on documentElement + body classes (zd-theme-dark). Tokens currently only style extension UI; Customizer bridges them onto Zendesk.
- Component conventions: `.zd-modal-overlay`, `.zd-settings-*`, `.zd-setting-section`, `.zd-btn-primary/secondary/danger`, `.zd-*-panel(+-header)`, `.zd-*-tab`.

## Status log
- 2026-06-22: Shift-warning feature shipped (commit a69ef8a). Customizer build started.
