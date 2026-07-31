# AGENTS.md

Source of truth for AI agents and contributors working in Support Toolkit.
Read once at session start. Re-read after pulling changes that modify this file,
`extension/manifest.json`, storage contracts, permissions, or release workflow.

## What this is

Support Toolkit is a no-build Chrome Manifest V3 extension for Happiness
Engineers. It injects a productivity toolbar and optional workflow enhancements
into Zendesk. Current source version lives in `extension/manifest.json`.

Canonical repository: <https://github.com/Automattic/support-toolkit>

## Authority order

When sources disagree, use this order:

1. Current code and `extension/manifest.json` for runtime behavior.
2. Targeted tests under `test/` for guarded regressions.
3. `CHANGELOG.md` for release intent.
4. This file for contributor workflow and safety boundaries.
5. `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, historical specs, ignored
   `.claude/`, and `.superpowers/` only as context. Several are stale.

Do not infer current behavior from a release ZIP, screenshot, historical plan,
or AI prompt without checking current source.

## Hard boundaries

- Never commit customer names, emails, domains, ticket IDs, account IDs, IPs,
  ticket bodies, comments, credentials, API keys, calendar URLs, or production
  screenshots containing customer data.
- Treat Zendesk DOM, ticket content, Linear responses, storage/import data, and
  page-world events as untrusted input.
- Never test send, merge, solve, macro, or other mutating workflow behavior on
  a live customer ticket. Use a dedicated sandbox/test ticket and explicit
  human approval.
- Never put secrets or sensitive results into host-page DOM, logs, exports,
  screenshots, fixtures, or shared notes.
- Do not add a network destination, host permission, iframe capability,
  MAIN-world script, customer-data sink, or storage key without explicit
  privacy/security review.
- Shared-system output remains a draft for human review. The extension must not
  auto-send customer communications or silently perform consequential actions.

Current source does not yet satisfy every boundary above. In particular,
credential UI/export handling and complete data deletion need remediation.
Treat existing behavior as a defect to reduce, never as precedent for new code.

Consequential actions include sending a reply, changing Draft Mode, merge
visibility, post-save routing, reply channel, ticket status, macros, or another
shared Zendesk state. Existing workflow helpers can change some defaults when
enabled; contributors must keep them individually configurable, visible to the
operator, scoped to intended ticket/composer, and covered by sandbox tests.

## Runtime model

There is no package install, compile, bundle, or minification step. Chrome loads
files directly from `extension/`.

Technology:

- vanilla JavaScript using IIFEs and `window.ZD*` globals
- CSS loaded directly from `extension/styles.css`
- Chrome Extension Manifest V3
- `chrome.storage.sync` and `chrome.storage.local`
- Node only for local syntax and smoke tests

### Execution contexts

`extension/manifest.json` defines four content-script registrations spanning
three page contexts, plus a service worker:

1. Zendesk top-frame isolated world at `document_start`: selectors and early
   layout modules.
2. Same top-frame isolated world at `document_idle`: main application modules.
3. User Info app iframe isolated world: `site-tools-menu.js` with
   `all_frames: true`.
4. Zendesk MAIN world: `workflow-helper.js`, bridged through DOM
   attribute/event state from `workflow-helper-bridge.js`.
5. Extension service worker: `background.js`, currently a minimal placeholder.

Top-frame registrations currently match `*.zendesk.com`, `*.zopim.com`, and
`*.zendesk-staging.com`. Treat each changed match as a supported surface that
needs relevant validation, or narrow manifest matches deliberately.

These worlds do not share JavaScript globals. MAIN-world code cannot use
`chrome.*`. The User Info iframe cannot use top-frame `window.ZD*` globals.

### Critical load order

The manifest order is dependency order. In the main isolated-world block:

- infrastructure loads before feature modules;
- feature modules expose `window.ZD*` APIs;
- `workflow-helper-bridge.js` loads before composition;
- `content.js` stays last.

When adding a module, update the manifest and a smoke test. Do not reorder files
without tracing every global dependency.

### Effective composition root

`extension/content.js` remains the active composition root and owns more
behavior than the modular filenames imply. Before changing counters, settings,
schedule, notes, stats, worked log, theme, toolbar, or initialization, inspect
`content.js` plus the named feature module. Some modules are duplicate or
currently uninitialized; loading them twice can duplicate listeners or counts.

## Feature and file map

| Need | Start with | Also inspect |
|---|---|---|
| Manifest, permissions, script worlds | `extension/manifest.json` | every referenced file and host |
| Toolbar, settings, stats, worked log | `extension/content.js` | `styles.css`, `storage.js`, `constants.js` |
| Counts and resolution detection | `content.js`, `storage.js` | `auto-count.js` before deciding to revive/remove it |
| Calendar, shifts, warnings | `timers.js`, `content.js` | loaded duplicate `schedule.js`, `timer-manager.js`, notifications, storage |
| Notes | notes section in `content.js` | `notes.js`, local-storage keys |
| Linear search | `linear.js`, `linear-panel.js` | `transcript.js`, settings/storage, manifest permission |
| LibreChat panel | `librechat-panel.js` | toolbar setup and panel CSS |
| Transcript copy | `transcript.js`, `content.js` | active Zendesk pane and clipboard behavior |
| Sidebar stacking | `customizer-apply.js`, `zendesk-selectors.js` | constants/settings and `stacking-scope.test.js` |
| Zendesk styling | `zd-styling.js` | settings flags and host CSS scope |
| Site Tools iframe | `site-tools-menu.js` | iframe match and `all_frames` manifest setting |
| Workflow automation | `workflow-helper.js` | bridge, MAIN-world boundaries, Zendesk internals |
| Export/restore | `export.js`, `storage.js` | all storage schemas and credential exclusion |
| Theme | `theme-presets.js`, `content.js` | `styles.css`; `theme.js` may not own active behavior |
| Version popup | `extension/changelog.js`, `content.js` | manifest, root changelog, README |

Search all Zendesk selector owners before changing a selector. There is no
single complete selector registry today.

## Data and network map

Current extension can interact with:

| Destination | Trigger | Data or effect |
|---|---|---|
| configured HTTPS calendar origin | configured schedule refresh | credential-bearing ICS URL and calendar response; manifest permission currently covers `schedule.happy.tools`, while stored/imported values need allowlist review |
| `api.linear.app` | panel opening, team/state loading, explicit search | API credential, search/filter terms, and requested issue fields |
| current Zendesk origin | styling/workflow helpers | ticket/user REST reads and operator-configured UI state changes |
| `chat.a8c.com` | user opens LibreChat panel | embedded authenticated application and user-entered content |
| Giphy media hosts | selected notifications/stats UI | automatic media request metadata |
| internal Site Tools targets | user clicks a generated link | domain/blog identifiers embedded in destination URL |
| selected site origin | user clicks `robots.txt`, hosting-provider, CLI, or Site Health route | domain plus selected path, potentially opening authenticated admin surface |

Manifest also exposes `images/*` and `sounds/*` as web-accessible resources to
`<all_urls>`. Review this on any asset change; narrow matches or use dynamic
URLs when compatible so unrelated sites cannot fingerprint extension assets.

Do not describe all data as local. Configuration, credentials, counts, and some
history use Chrome sync storage; notes, activity, and worked logs use local
storage. Treat Chrome storage as application storage, not a secrets vault.

## Known risk areas

These are change constraints, not proof that another area is safe:

- Transcript/status queries must resolve the active Zendesk ticket pane. A
  document-wide query can mix concurrently open tickets.
- Do not interpolate API, storage, import, ticket, or user values into
  `innerHTML`. Build DOM nodes and assign `textContent`; validate links and
  colors separately.
- Keep credentials out of host-page DOM, synced backups, exports, and logs.
- Auto-count has both inline and module implementations. Choose one before
  enabling or refactoring; never initialize both.
- Calendar state currently spans multiple modules and caches. A URL or refresh
  change must update every active authority.
- Date rollover mixes UTC and local-day semantics. Preserve data until one
  explicit day model and migration are tested.
- Storage read-modify-write sequences can race across tabs. Do not add another
  whole-object rewrite without concurrency analysis.
- Export, restore, and clear-all behavior must be tested as one data contract.
- Current clear-all behavior does not remove every owned notes, Worked Log,
  reminder, theme, position, and version key. Do not claim complete deletion
  until an enumerated storage/retention test proves it.
- Main stylesheet contains selectors that can affect Zendesk. New CSS must be
  scoped under extension-owned `.zd-*` containers unless host styling is an
  explicit, toggleable feature.
- Ctrl+Enter and other workflow automation must verify active composer and
  intended ticket before acting.
- Zendesk private APIs and DOM selectors are fragile. Add recovery behavior and
  a regression test for each dependency.

## Before changing code

1. Inspect worktree and current branch. Preserve every unknown change; never
   reset, clean, stash, discard, or overwrite it.
2. Use `git fetch` to inspect current `main`. Pull, switch branches, or create a
   branch only when worktree state is understood and human request permits it.
3. Read this file, manifest, affected source, both existing tests, and current
   changelog.
4. State requested behavior, privacy boundary, execution context, storage
   impact, network/permission impact, and manual test surface.
5. Run baseline checks below.

Baseline from repository root:

```bash
git status --short --branch

for file in extension/*.js test/*.js; do
  node --check "$file" || exit 1
done

node test/load-smoke.js
node test/stacking-scope.test.js
python3 -m json.tool extension/manifest.json >/dev/null
```

## Implementation rules

- Preserve vanilla JavaScript and no-build architecture unless change is
  explicitly approved.
- Use IIFE encapsulation and established `window.ZD*` namespace pattern.
- Use `.zd-*` names for extension-owned CSS.
- Use `ZDStorage` where it owns data. If a feature deliberately uses direct
  local storage, document key and lifecycle.
- Add migrations before defaults mask missing legacy values.
- Keep setting definition, UI, load, save, consumer, storage-change response,
  backup/restore, and docs synchronized.
- Use async/await with explicit failure and recovery behavior.
- Add a targeted regression test for each bug fixed.
- Do not silently revive dead modules or duplicate active listeners.
- Keep `content.js` last in manifest's isolated-world block.

## Validation

Automated checks are necessary but narrow. After relevant changes, reload the
unpacked `extension/` folder only in a dedicated Zendesk sandbox/test
environment and validate affected paths in Chrome.

Minimum manual matrix:

- Zendesk Home and Views
- existing ticket and new-ticket page
- SPA navigation between open tickets
- affected Zopim and Zendesk staging route when manifest/source change applies
- custom ticket layouts
- User Info app iframe
- affected Settings toggle and persistence after reload
- light/dark mode where UI changed
- no content-script or service-worker console errors

Use only synthetic/sanitized sandbox fixtures for every unpacked-extension
test. Disable unrelated workflow automation before testing, then enable only
the feature under test with explicit approval. Verify inactive ticket panes
cannot affect result.

For timer/observer changes, run a long-session check and verify no duplicate
intervals, listeners, observers, requests, or notifications.

## Documentation and releases

README, CONTRIBUTING, SECURITY, and in-app changelog contain known historical
drift. Any touched behavior must update relevant docs from current code, not
copy stale statements.

Release changes synchronize all of:

1. `extension/manifest.json`
2. `CHANGELOG.md`
3. `README.md` version/current behavior
4. `extension/changelog.js`
5. `SECURITY.md` support matrix and current data flows
6. tests and manual validation record
7. tag/release artifact and flat ZIP contents

The release ZIP is a flat archive of `extension/` contents with
`manifest.json` at archive root. Exclude `.DS_Store`, local AI config,
credentials, tests, source-only docs, and stale artifacts. Inspect exact archive
before publishing.

Never commit, tag, push, create a release, or upload to Chrome Web Store unless
the human explicitly requests and approves exact payload.

## Git and review

- Branch from current `main`; do not work on stale historical branches.
- Use focused commits and simplified Conventional Commit subjects.
- Stage only intended files; never use broad staging without inspecting status.
- Inspect full diff and rerun checks before asking for review.
- Include screenshots for UI changes, using only synthetic/sanitized content.
- Call out permissions, storage, network, privacy, Zendesk coupling, and manual
  validation in PR description.

## Kirin Hive Mind

Kirin Hive Mind stores durable team methods, gotchas, decisions, and canonical
pointers. It does not own extension runtime facts; this repository does.

For authorized Kirin contributors, after a method survives a second real use,
or a gotcha is likely to recur:

1. Use Kirin workspace `hive-mind-proposal` skill.
2. Draft smallest privacy-safe note or update.
3. Cite this repository and checked commit/date.
4. Name owner, next test, limitations, and improve-or-retire criterion.
5. Show exact proposal and obtain human approval before shared write.

Never copy customer/ticket content, credentials, raw transcripts, local notes,
or temporary implementation state into Hive Mind.

Contributors without access to the private Kirin workspace skip this section;
the public Support Toolkit repository remains complete without Hive access.
