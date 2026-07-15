# Zendesk Enhancements Modules — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the four `/Scripts` userscripts into the extension as first-class, settings-toggleable modules working on Zendesk.

**Architecture:** Each userscript becomes a content-script module following the existing `customizer-apply.js` pattern (IIFE exposing a `window.ZD*` global, reads `chrome.storage.sync` config, injects behavior, live-refreshes on `storage.onChanged`). Two modules need special injection: the Site Tools menu runs in the cross-origin User Info app iframe (new manifest match), and the Workflow Helper runs in the page **main world** (`world:"MAIN"`) with a tiny isolated bridge passing it config. Settings are surfaced in a new "Zendesk Enhancements" area of the existing Settings overlay.

**Tech Stack:** Vanilla JS (ES2018, IIFE modules — no bundler), Chrome MV3 content scripts, `chrome.storage.sync`, CSS injection, MutationObserver.

## Global Constraints

- **No third-party data.** All network calls stay same-origin to Zendesk (`/api/v2/...` with the agent session cookie). No new external endpoints or permissions beyond one content-script match for the User Info app origin.
- **No emojis in UI copy.** Match the existing toolbar/settings visual style.
- **Config store:** `chrome.storage.sync`, key `ZDCounter-config` (via `ZDStorage.getConfig()`/`setConfig()` in page code, or `chrome.storage.sync.get(['ZDCounter-config'])` directly in standalone modules). Defaults live in `extension/constants.js` `DEFAULT_CONFIG`.
- **Module shape:** each new file is an IIFE that (a) exposes a `window.ZD<Name>` global (so `test/load-smoke.js` can assert it loaded) and (b) is self-contained (no import of page-only globals it can't guarantee).
- **Porting basis:** the four scripts in `/Scripts/*.user.js` are the reference implementations. "Port" = copy the behavior, then: strip the `// ==UserScript==` header; wrap in an IIFE exposing the global; replace `@grant`/Tampermonkey assumptions with the config-gating described per task; remove `DEBUG`/`postMessage` diagnostics; keep `warn()` logging.
- **Verification per module:** `node --check <file>` (syntax) → add to `test/load-smoke.js` and run `node test/load-smoke.js` (loads + global present) → live-verify on ticket `https://a8c.zendesk.com/agent/tickets/11438969` with Tampermonkey disabled.
- **Load order matters:** in the manifest `document_idle` block, `content.js` stays **last**; new isolated modules go before it.

---

### Task 1: Configuration foundation

Adds every new config key with its default so all later modules can read them and the Settings form can bind them.

**Files:**
- Modify: `extension/constants.js` (DEFAULT_CONFIG object, currently ends ~line 71)

**Interfaces:**
- Produces: config keys `siteToolsMenu`, `stylingDarkMode`, `stylingResizeBoxes`, `stylingWideMessages`, `stylingChatBubbles`, `wfDraftMode`, `wfMergeUncheck`, `wfStayOnTicket`, `wfMessagingDefault` (all boolean, default `true`). `stackSidebars`/`stackTopPx` already exist.

- [ ] **Step 1: Add the keys to DEFAULT_CONFIG**

In `extension/constants.js`, inside `DEFAULT_CONFIG`, immediately after the `stackTopPx` line, add:

```javascript
        // Zendesk Enhancements — Site Tools menu (User Info app iframe)
        siteToolsMenu: true,

        // Zendesk Enhancements — Styling sub-features
        stylingDarkMode: true,
        stylingResizeBoxes: true,
        stylingWideMessages: true,
        stylingChatBubbles: true,

        // Zendesk Enhancements — Workflow automation sub-features
        wfDraftMode: true,
        wfMergeUncheck: true,
        wfStayOnTicket: true,
        wfMessagingDefault: true,
```

- [ ] **Step 2: Syntax check**

Run: `node --check extension/constants.js`
Expected: no output (exit 0).

- [ ] **Step 3: Smoke test still passes**

Run: `node test/load-smoke.js`
Expected: `PASS: all modules load and expose their globals`.

- [ ] **Step 4: Commit**

```bash
git add extension/constants.js
git commit -m "feat: add config defaults for Zendesk Enhancements modules"
```

---

### Task 2: Harden the sidebar-stacking engine (content-based pane tagging + height cap)

Replaces the fragile `column-N` position mapping in `customizer-apply.js` with content-based pane tagging, so stacking is correct under custom layouts, and caps the notes pane height. Keeps the single `stackSidebars` setting, the draggable divider, `stackTopPx`, `document_start` injection, and `storage.onChanged` refresh.

**Files:**
- Modify: `extension/customizer-apply.js` (whole `buildStackCSS` + add a tagging observer; keep the divider/`refresh`/storage plumbing)
- Reference: `Scripts/zd-notes-sidebar.user.js` (content-detection + height-cap logic)

**Interfaces:**
- Consumes: `window.ZDZendeskSelectors` (already loaded first at document_start); `stackSidebars`, `stackTopPx` from config.
- Produces: `window.ZDCustomizerApply = { refresh, buildStackCSS }` (unchanged surface). Panes tagged with `data-zd-pane="notes|info|conversation"`.

- [ ] **Step 1: Add a pane-tagging module inside the IIFE**

In `extension/customizer-apply.js`, add these helpers near the top of the IIFE (after the `INFO`/`NOTES`/`CONV` consts). This finds, per ticket grid, which column holds Notes and which holds the ContextPanel, and tags them — independent of column index:

```javascript
    const PANE_ATTR = 'data-zd-pane';
    const NOTES_IFRAME = 'iframe[title="a8cnotes"]';
    const APP_ELEMENT = '[data-test-id="app-element"]';
    const CONTEXT_PANEL = '[data-test-id="component-type-ContextPanel"]';
    const LAYOUT_COLUMN = '[data-test-id^="column-"]';
    const GRID_ANY = '[data-test-id$="-custom-layout"]';

    function findNotesColumn(cols) {
        for (const col of cols) {
            if (col.querySelector(NOTES_IFRAME)) return col;
        }
        // Apps are lazy: before the iframe loads the column still renders the
        // app name as text ("a8cnotes"). Verified live 2026-07-15.
        for (const col of cols) {
            if (col.querySelector(APP_ELEMENT) && /a8cnotes/i.test(col.textContent || '')) {
                return col;
            }
        }
        return null;
    }

    function tagGrid(grid) {
        const cols = [...grid.children].filter((c) => c.matches(LAYOUT_COLUMN));
        if (cols.length !== 3) return; // only the standard 3-pane ticket layout
        const notes = findNotesColumn(cols);
        const ctx = grid.querySelector(CONTEXT_PANEL);
        const info = ctx ? ctx.closest(LAYOUT_COLUMN) : null;
        // Mid-shuffle Zendesk can momentarily put both in one pane — skip then.
        if (!notes || !info || notes === info) return;
        const conv = cols.find((c) => c !== notes && c !== info) || null;
        setPane(notes, 'notes');
        setPane(info, 'info');
        if (conv) setPane(conv, 'conversation');
    }

    function setPane(col, value) {
        if (col.getAttribute(PANE_ATTR) !== value) col.setAttribute(PANE_ATTR, value);
    }

    function tagAll() {
        document.querySelectorAll(GRID_ANY).forEach(tagGrid);
    }
```

- [ ] **Step 2: Rewrite `buildStackCSS` to key off the pane tags**

Replace the body of `buildStackCSS(mode)` so its rules target `[data-zd-pane="..."]` instead of `CONV`/`NOTES`/`INFO`, and add the notes height cap. Keep the `--zd-stack-top` row template and the `left`/`right` branches:

```javascript
    const P_NOTES = `${GRID} [${'data-zd-pane'}="notes"]`;
    const P_INFO = `${GRID} [${'data-zd-pane'}="info"]`;
    const P_CONV = `${GRID} [${'data-zd-pane'}="conversation"]`;
    const NOTES_MAX = '60vh';

    function buildStackCSS(mode) {
        try {
            if (mode !== 'right' && mode !== 'left') return '';
            const rows = `${GRID} { grid-template-rows: var(--zd-stack-top, 420px) minmax(0, 1fr) !important; }`;
            const notesCap = `${P_NOTES} { min-height: 0 !important; max-height: ${NOTES_MAX} !important; overflow-y: auto !important; }`;
            if (mode === 'left') {
                return [
                    rows, notesCap,
                    `${P_INFO} { grid-column: 1 !important; grid-row: 1 !important; order: 0 !important; }`,
                    `${P_NOTES} { grid-column: 1 !important; grid-row: 2 !important; order: 0 !important; }`,
                    `${P_CONV} { grid-column: 2 / -1 !important; grid-row: 1 / -1 !important; order: 0 !important; }`
                ].join('\n');
            }
            return [
                rows, notesCap,
                `${P_CONV} { grid-column: 1 / 3 !important; grid-row: 1 / -1 !important; order: 0 !important; }`,
                `${P_INFO} { grid-column: 3 !important; grid-row: 1 !important; order: 0 !important; }`,
                `${P_NOTES} { grid-column: 3 !important; grid-row: 2 !important; order: 0 !important; }`
            ].join('\n');
        } catch (e) {
            warn('buildStackCSS failed', e);
            return '';
        }
    }
```

Note: the divider's `positionHandle()` reads the info pane. Change its `document.querySelector(INFO)` lookups to `document.querySelector('[data-zd-pane="info"]')` and the grid lookup stays `GRID`. Keep `CONV`/`NOTES`/`INFO` consts only if still referenced elsewhere; otherwise remove.

- [ ] **Step 3: Drive tagging from a debounced, idempotent observer**

In `refresh()`, after computing `stackingActive`, start/stop tagging. Add near the divider observer setup:

```javascript
    let tagScheduled = false;
    function scheduleTag() {
        if (tagScheduled) return;
        tagScheduled = true;
        Promise.resolve().then(() => { tagScheduled = false; tagAll(); });
    }

    function startTagObserver() {
        if (startTagObserver._on) return;
        startTagObserver._on = true;
        tagAll();
        const mo = new MutationObserver(scheduleTag);
        const root = document.querySelector('main#main_panes') || document.body || document.documentElement;
        mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleTag(); });
    }
```

In `refresh()`, call `startTagObserver()` whenever `stackingActive` becomes true (tags are harmless when stacking is off, but only start the observer when needed). Tagging must run before the CSS matches; since CSS uses `!important` attribute selectors it re-matches automatically once tags land.

- [ ] **Step 4: Syntax check**

Run: `node --check extension/customizer-apply.js`
Expected: exit 0.

- [ ] **Step 5: Smoke test**

Run: `node test/load-smoke.js`
Expected: PASS (customizer-apply.js already in FILES; `ZDCustomizerApply` still exported).

- [ ] **Step 6: Live-verify stacking**

Load the unpacked extension (reload it in `chrome://extensions`), open ticket 11438969 with Tampermonkey disabled. In the extension Settings set "Stack sidebars" to "Stack on right". Confirm via the browser tool that:
- The column containing the ContextPanel gets `data-zd-pane="info"`, the a8cnotes column gets `data-zd-pane="notes"`, conversation gets `conversation`.
- Info sits above Notes in the right track; conversation spans the other two.
- Dragging the divider resizes the split and the height persists after reload.
- A long note scrolls within its pane rather than pushing the sidebar off-screen.

- [ ] **Step 7: Commit**

```bash
git add extension/customizer-apply.js
git commit -m "fix: content-based pane detection + notes height cap for sidebar stacking"
```

---

### Task 3: Styling module

Ports `zd-styling.user.js` into a config-gated module: dark-mode iframe completion, resizable field boxes, wide messages, chat bubbles + role classifier. Each sub-feature independently toggleable.

**Files:**
- Create: `extension/zd-styling.js`
- Modify: `extension/manifest.json` (add `zd-styling.js` to the `document_idle` isolated block, before `content.js`)
- Modify: `test/load-smoke.js` (add file + expected global)
- Reference: `Scripts/zd-styling.user.js`

**Interfaces:**
- Consumes: config `stylingDarkMode`, `stylingResizeBoxes`, `stylingWideMessages`, `stylingChatBubbles`.
- Produces: `window.ZDStyling = { refresh }`.

- [ ] **Step 1: Create `extension/zd-styling.js`**

Port the four CSS blocks and the article classifier from `Scripts/zd-styling.user.js` verbatim (the `DARK_MODE_COMPLETION_CSS`, `RESIZE_BOXES_CSS`, `MESSAGE_WIDTH_CSS`, `CHAT_STYLE_CSS` strings and the `getUserCommentType`/`getCommentType`/`classifyArticle`/`setupChatClassifier` functions). Wrap as an IIFE exposing `window.ZDStyling`. Replace the static `FEATURES` object with config-driven application:

```javascript
(function () {
    'use strict';
    if (window.top !== window.self) return; // top document only (as in the source)

    const CONFIG_KEY = 'ZDCounter-config';
    // Each sub-feature: config flag -> style id + CSS (or classifier setup).
    // addStyle(id, css) and removeStyle(id) toggle a <style> element in <head>.

    function addStyle(id, css) {
        let el = document.getElementById(id);
        if (!el) { el = document.createElement('style'); el.id = id; (document.head || document.documentElement).appendChild(el); }
        if (el.textContent !== css) el.textContent = css;
    }
    function removeStyle(id) { const el = document.getElementById(id); if (el) el.remove(); }

    // ... PASTE the four *_CSS string consts and the classifier functions here ...

    let classifierStarted = false;
    function applyConfig(cfg) {
        cfg = cfg || {};
        cfg.stylingDarkMode !== false ? addStyle('zd-styling-dark-mode-completion', DARK_MODE_COMPLETION_CSS) : removeStyle('zd-styling-dark-mode-completion');
        cfg.stylingResizeBoxes !== false ? addStyle('zd-styling-resize-boxes', RESIZE_BOXES_CSS) : removeStyle('zd-styling-resize-boxes');
        cfg.stylingWideMessages !== false ? addStyle('zd-styling-message-width', MESSAGE_WIDTH_CSS) : removeStyle('zd-styling-message-width');
        if (cfg.stylingChatBubbles !== false) {
            addStyle('zd-styling-chat-style', CHAT_STYLE_CSS);
            if (!classifierStarted) {
                classifierStarted = true;
                if (document.body) setupChatClassifier();
                else document.addEventListener('DOMContentLoaded', setupChatClassifier, { once: true });
            }
        } else {
            removeStyle('zd-styling-chat-style');
            // Classifier observer is left running if already started; its CSS is
            // gone so tagged articles simply render unstyled. (No teardown needed.)
        }
    }

    function refresh() {
        return new Promise((resolve) => {
            try {
                chrome.storage.sync.get([CONFIG_KEY], (res) => {
                    applyConfig((res && res[CONFIG_KEY]) || {});
                    resolve();
                });
            } catch (e) { applyConfig({}); resolve(); }
        });
    }

    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'sync' && changes[CONFIG_KEY]) refresh();
        });
    } catch (e) { /* ignore */ }

    window.ZDStyling = { refresh };
    refresh();
})();
```

Note: `MESSAGE_WIDTH_CSS` and `CHAT_STYLE_CSS` both contain the `omni-log-item-message { width:100% }` rule. Keep it only in `MESSAGE_WIDTH_CSS`; delete those first two selector blocks from the pasted `CHAT_STYLE_CSS` so the bubble style starts at `article[data-test-id="omni-log-comment-item"]`.

- [ ] **Step 2: Add to the manifest idle block**

In `extension/manifest.json`, in the second content_scripts entry's `js` array, add `"zd-styling.js",` immediately before `"content.js"`.

- [ ] **Step 3: Register in the smoke test**

In `test/load-smoke.js`, add `'zd-styling.js'` to `FILES` and `'ZDStyling'` to `EXPECTED_GLOBALS`.

- [ ] **Step 4: Syntax + smoke**

Run: `node --check extension/zd-styling.js && node test/load-smoke.js`
Expected: exit 0 then `PASS: all modules load and expose their globals`.

- [ ] **Step 5: Live-verify**

Reload the extension, open ticket 11438969. Confirm: chat comments get `data-zes-comment-type` attributes and render as bubbles; multiline ticket fields show a resize handle; app iframes are dark in Zendesk dark theme. Toggle each off in Settings and confirm the corresponding `<style>` disappears and the effect reverts.

- [ ] **Step 6: Commit**

```bash
git add extension/zd-styling.js extension/manifest.json test/load-smoke.js
git commit -m "feat: Styling module (dark mode, resize boxes, wide messages, chat bubbles)"
```

---

### Task 4: Site Tools menu (User Info app iframe)

Ports `zd-site-tools-menu.user.js` into a module injected into the cross-origin User Info app iframe, gated by `siteToolsMenu`.

**Files:**
- Create: `extension/site-tools-menu.js`
- Modify: `extension/manifest.json` (add a NEW content_scripts block matching the app origin)
- Modify: `test/load-smoke.js` (add file + expected global)
- Reference: `Scripts/zd-site-tools-menu.user.js`

**Interfaces:**
- Consumes: config `siteToolsMenu`.
- Produces: `window.ZDSiteToolsMenu = { refresh }`.

- [ ] **Step 1: Create `extension/site-tools-menu.js`**

Port the `MENU_LINKS`, `injectStyles`, `closeMenus`, `linksRowFor`, `siteInfoFor`, `openMenu`, `injectToggles`, and the document/keydown/blur listeners from the source. Remove the `DEBUG`/`debugReport`/`lastSites` diagnostics entirely. Wrap as an IIFE exposing `window.ZDSiteToolsMenu`. Gate on config:

```javascript
(function () {
    'use strict';
    const CONFIG_KEY = 'ZDCounter-config';
    let enabled = true;

    // ... PASTE ported MENU_LINKS, injectStyles, closeMenus, linksRowFor,
    //     siteInfoFor, openMenu, injectToggles (minus debug) here ...

    function removeAll() {
        closeMenus();
        document.querySelectorAll('.' + TOGGLE_CLASS).forEach((t) => t.remove());
    }

    function applyEnabled(on) {
        enabled = on !== false;
        if (enabled) { injectStyles(); injectToggles(); }
        else removeAll();
    }

    function refresh() {
        try {
            chrome.storage.sync.get([CONFIG_KEY], (res) => {
                const cfg = (res && res[CONFIG_KEY]) || {};
                applyEnabled(cfg.siteToolsMenu);
            });
        } catch (e) { applyEnabled(true); }
    }

    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'sync' && changes[CONFIG_KEY]) refresh();
        });
    } catch (e) { /* ignore */ }

    // Global listeners (close on outside click / blur / Escape) — always safe.
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.' + MENU_CLASS) && !event.target.closest('.' + TOGGLE_CLASS)) closeMenus();
    });
    window.addEventListener('blur', closeMenus);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenus(); });

    // Keep toggles present across app re-renders; only inject while enabled.
    let scheduled = false;
    new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        Promise.resolve().then(() => { scheduled = false; if (enabled) injectToggles(); });
    }).observe(document.documentElement, { childList: true, subtree: true });

    window.ZDSiteToolsMenu = { refresh };
    refresh();
})();
```

Keep `injectToggles`'s own guard that skips our own `.zdstm-menu` rows.

- [ ] **Step 2: Add the app-origin manifest block**

In `extension/manifest.json`, add a new object to the `content_scripts` array:

```json
    {
      "matches": [ "https://126740.apps.zdusercontent.com/*" ],
      "js": [ "site-tools-menu.js" ],
      "run_at": "document_idle"
    }
```

- [ ] **Step 3: Register in the smoke test**

Add `'site-tools-menu.js'` to `FILES` and `'ZDSiteToolsMenu'` to `EXPECTED_GLOBALS` in `test/load-smoke.js`.

- [ ] **Step 4: Syntax + smoke**

Run: `node --check extension/site-tools-menu.js && node test/load-smoke.js`
Expected: exit 0 then PASS.

- [ ] **Step 5: Live-verify**

Reload the extension, open ticket 11438969, open the User Info app in the sidebar so its site rows render. Confirm each site row gains a "Tools ▾" toggle; clicking opens the dropdown; a link (e.g. "Blog RC") opens the correct URL in a new tab. Toggle `siteToolsMenu` off in Settings → toggles disappear; on → they return.

- [ ] **Step 6: Commit**

```bash
git add extension/site-tools-menu.js extension/manifest.json test/load-smoke.js
git commit -m "feat: Site Tools menu module in the User Info app iframe"
```

---

### Task 5: Workflow helper (main world) + config bridge

Ports `zd-workflow-helper.user.js` into a `world:"MAIN"` module (needs `window.LotusReact`) fed feature flags by a small isolated-world bridge.

**Files:**
- Create: `extension/workflow-helper.js` (MAIN world)
- Create: `extension/workflow-helper-bridge.js` (isolated world)
- Modify: `extension/manifest.json` (add MAIN-world block; add bridge to idle block)
- Modify: `test/load-smoke.js` (add both files + globals)
- Reference: `Scripts/zd-workflow-helper.user.js`

**Interfaces:**
- Bridge produces: on `documentElement`, attribute `data-zd-workflow-config` = JSON of `{wfDraftMode,wfMergeUncheck,wfStayOnTicket,wfMessagingDefault}`, plus a dispatched `zd-workflow-config` event on `document` whenever it changes.
- Main script consumes: reads that attribute (on the event and on load) into its `FEATURES`.
- Globals: `window.ZDWorkflowHelperBridge` (bridge), `window.ZDWorkflowHelper` (main).

Cross-world note: isolated and main worlds share the DOM, so a DOM **attribute** on `documentElement` is the robust channel (event `detail` is not reliably cloned across worlds). The bridge sets the attribute and fires a bare signal event; the main script reads the attribute.

- [ ] **Step 1: Create `extension/workflow-helper-bridge.js` (isolated)**

```javascript
(function () {
    'use strict';
    const CONFIG_KEY = 'ZDCounter-config';
    const ATTR = 'data-zd-workflow-config';
    const KEYS = ['wfDraftMode', 'wfMergeUncheck', 'wfStayOnTicket', 'wfMessagingDefault'];

    function publish(cfg) {
        cfg = cfg || {};
        const flags = {};
        KEYS.forEach((k) => { flags[k] = cfg[k] !== false; }); // default on
        try {
            document.documentElement.setAttribute(ATTR, JSON.stringify(flags));
            document.dispatchEvent(new Event('zd-workflow-config'));
        } catch (e) { /* ignore */ }
    }

    function refresh() {
        try {
            chrome.storage.sync.get([CONFIG_KEY], (res) => publish((res && res[CONFIG_KEY]) || {}));
        } catch (e) { publish({}); }
    }

    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'sync' && changes[CONFIG_KEY]) refresh();
        });
    } catch (e) { /* ignore */ }

    window.ZDWorkflowHelperBridge = { refresh };
    refresh();
})();
```

- [ ] **Step 2: Create `extension/workflow-helper.js` (MAIN world)**

Port the entire logic body of `Scripts/zd-workflow-helper.user.js` (the utilities `waitForElement`, `waitForElementSettled`, `debounceLeadingTrailing`, `getPageInfo`, the Zendesk internals, and the four features + active-pane tracking) verbatim. Two changes only:

1. Make `FEATURES` mutable and driven by the bridge instead of a hardcoded literal:

```javascript
    const FEATURES = { draftMode: true, mergeUncheck: true, stayOnTicket: true, messagingDefault: true };
    const ATTR = 'data-zd-workflow-config';
    let booted = false;

    function readFlags() {
        try {
            const raw = document.documentElement.getAttribute(ATTR);
            if (!raw) return;
            const f = JSON.parse(raw);
            FEATURES.draftMode = f.wfDraftMode !== false;
            FEATURES.mergeUncheck = f.wfMergeUncheck !== false;
            FEATURES.stayOnTicket = f.wfStayOnTicket !== false;
            FEATURES.messagingDefault = f.wfMessagingDefault !== false;
        } catch (e) { /* keep previous */ }
    }

    function boot() {
        if (booted) return; // one-time wiring; feature checks read FEATURES live
        booted = true;
        if (FEATURES.draftMode) setupDraftModeHotkey();
        setupMergeUncheck();
        setupActivePaneTracking();
    }

    document.addEventListener('zd-workflow-config', () => { readFlags(); boot(); });
    readFlags();
    if (document.documentElement.getAttribute(ATTR)) boot();
    window.ZDWorkflowHelper = { readFlags };
```

Because the feature functions already check `FEATURES.x` at call time (e.g. `setupMergeUncheck`'s handler, `updateActivePane`'s per-feature branches, the hotkey guard), live toggles take effect without re-wiring. `setupDraftModeHotkey`/`setupMergeUncheck`/`setupActivePaneTracking` are always wired once; their internal `FEATURES` guards gate behavior.

2. Remove the `DEBUG`/`log` no-op path? Keep `warn`; make `log` a no-op (`const log = () => {}`).

- [ ] **Step 3: Add manifest blocks**

In `extension/manifest.json`:
- Add `"workflow-helper-bridge.js"` to the idle isolated block's `js`, before `"content.js"`.
- Add a new content_scripts object:

```json
    {
      "matches": [
        "https://*.zendesk.com/*",
        "https://*.zopim.com/*",
        "https://*.zendesk-staging.com/*"
      ],
      "js": [ "workflow-helper.js" ],
      "run_at": "document_idle",
      "world": "MAIN"
    }
```

- [ ] **Step 4: Register in the smoke test**

The smoke harness stubs `chrome`; the MAIN script does not use `chrome`, and it reads a DOM attribute (stub returns `null`, so `boot()` is deferred — fine). Add both files to `FILES` and `'ZDWorkflowHelperBridge'`, `'ZDWorkflowHelper'` to `EXPECTED_GLOBALS`. The main script references `document.documentElement.getAttribute` and `document.addEventListener` — both present in the stub. If the stub lacks `Event`, add `global.Event = class { constructor(t){ this.type = t; } };` to `test/load-smoke.js` globals.

- [ ] **Step 5: Syntax + smoke**

Run: `node --check extension/workflow-helper.js && node --check extension/workflow-helper-bridge.js && node test/load-smoke.js`
Expected: exit 0 then PASS.

- [ ] **Step 6: Live-verify**

Reload the extension, open ticket 11438969 (a messaging ticket if possible). Confirm: Draft Mode auto-enables on entering the ticket; the post-save action defaults to "Stay on ticket"; on a messaging ticket the composer defaults to Messaging; opening the merge dialog auto-unchecks the "requester can see" boxes; Ctrl+Enter still sends. Toggle each off in Settings and confirm the behavior stops on the next ticket visit.

- [ ] **Step 7: Commit**

```bash
git add extension/workflow-helper.js extension/workflow-helper-bridge.js extension/manifest.json test/load-smoke.js
git commit -m "feat: Workflow helper (main world) with isolated config bridge"
```

---

### Task 6: Settings UI — "Zendesk Enhancements"

Surfaces every new toggle (and moves the existing "Stack sidebars" dropdown) into a new area of the Settings overlay, wired to load/save.

**Files:**
- Modify: `extension/content.js` — `buildSettingsOverlay` (~line 1153 HTML), `loadSettingsForm` (~line 1696), `saveSettingsForm` (~line 1758)

**Interfaces:**
- Consumes: config keys from Task 1; `ZDStorage.getConfig()`/`setConfig()`.
- Produces: `.cfg-*` inputs for each new key following the existing convention.

- [ ] **Step 1: Add the Settings section HTML**

In `buildSettingsOverlay`, add a new `<section class="zd-settings-section">` (place it in the first column near the existing "Stack sidebars" group, or as its own section). Move the existing Stack-sidebars row into it and add the toggles:

```html
                    <section class="zd-settings-section">
                        <div class="zd-section-header">
                            <h3>Zendesk Enhancements</h3>
                            <p class="zd-section-desc">Layout, styling & workflow helpers</p>
                        </div>
                        <div class="zd-setting-group">
                            <div class="zd-settings-row">
                                <label>Stack sidebars</label>
                                <select class="cfg-stackSidebars">
                                    <option value="off">Off</option>
                                    <option value="right">Stack on right</option>
                                    <option value="left">Stack on left</option>
                                </select>
                            </div>
                            <label class="zd-setting-check"><input type="checkbox" class="cfg-siteToolsMenu" /><span>Site Tools menu</span></label>
                            <label class="zd-setting-check"><input type="checkbox" class="cfg-stylingDarkMode" /><span>Dark-mode app fix</span></label>
                            <label class="zd-setting-check"><input type="checkbox" class="cfg-stylingResizeBoxes" /><span>Resizable field boxes</span></label>
                            <label class="zd-setting-check"><input type="checkbox" class="cfg-stylingWideMessages" /><span>Wide messages</span></label>
                            <label class="zd-setting-check"><input type="checkbox" class="cfg-stylingChatBubbles" /><span>Chat bubbles</span></label>
                        </div>
                        <div class="zd-setting-group">
                            <label class="zd-setting-check"><input type="checkbox" class="cfg-wfDraftMode" /><span>Draft Mode default</span></label>
                            <label class="zd-setting-check"><input type="checkbox" class="cfg-wfMergeUncheck" /><span>Uncheck merge visibility</span></label>
                            <label class="zd-setting-check"><input type="checkbox" class="cfg-wfStayOnTicket" /><span>Stay on ticket default</span></label>
                            <label class="zd-setting-check"><input type="checkbox" class="cfg-wfMessagingDefault" /><span>Messaging as default channel</span></label>
                        </div>
                    </section>
```

Remove the old standalone "Stack sidebars (Zendesk)" group (lines ~1199-1208) so it isn't duplicated.

- [ ] **Step 2: Populate in `loadSettingsForm`**

Where `cfg-stackSidebars` is set (~line 1696), keep it, and add (each defaults true → checked unless explicitly `false`):

```javascript
        const checkByKey = (sel, val) => { const el = panel.querySelector(sel); if (el) el.checked = val !== false; };
        checkByKey('.cfg-siteToolsMenu', cfg.siteToolsMenu);
        checkByKey('.cfg-stylingDarkMode', cfg.stylingDarkMode);
        checkByKey('.cfg-stylingResizeBoxes', cfg.stylingResizeBoxes);
        checkByKey('.cfg-stylingWideMessages', cfg.stylingWideMessages);
        checkByKey('.cfg-stylingChatBubbles', cfg.stylingChatBubbles);
        checkByKey('.cfg-wfDraftMode', cfg.wfDraftMode);
        checkByKey('.cfg-wfMergeUncheck', cfg.wfMergeUncheck);
        checkByKey('.cfg-wfStayOnTicket', cfg.wfStayOnTicket);
        checkByKey('.cfg-wfMessagingDefault', cfg.wfMessagingDefault);
```

- [ ] **Step 3: Persist in `saveSettingsForm`**

In the `newCfg` object (~line 1758), add:

```javascript
            siteToolsMenu: panel.querySelector('.cfg-siteToolsMenu').checked,
            stylingDarkMode: panel.querySelector('.cfg-stylingDarkMode').checked,
            stylingResizeBoxes: panel.querySelector('.cfg-stylingResizeBoxes').checked,
            stylingWideMessages: panel.querySelector('.cfg-stylingWideMessages').checked,
            stylingChatBubbles: panel.querySelector('.cfg-stylingChatBubbles').checked,
            wfDraftMode: panel.querySelector('.cfg-wfDraftMode').checked,
            wfMergeUncheck: panel.querySelector('.cfg-wfMergeUncheck').checked,
            wfStayOnTicket: panel.querySelector('.cfg-wfStayOnTicket').checked,
            wfMessagingDefault: panel.querySelector('.cfg-wfMessagingDefault').checked,
```

- [ ] **Step 4: Syntax + smoke**

Run: `node --check extension/content.js && node test/load-smoke.js`
Expected: exit 0 then PASS.

- [ ] **Step 5: Live-verify**

Reload the extension, open Settings, confirm the "Zendesk Enhancements" section shows all controls populated from config. Toggle several, Save, reload the page, reopen Settings — values persist. Confirm each toggle live-affects its module (styling reverts immediately; site tools add/remove; workflow on next ticket).

- [ ] **Step 6: Commit**

```bash
git add extension/content.js
git commit -m "feat: Zendesk Enhancements settings section wiring all module toggles"
```

---

### Task 7: Integration pass, version bump, changelog

Final full verification, version bump, and changelog entry.

**Files:**
- Modify: `extension/manifest.json` (`version`)
- Modify: `CHANGELOG.md`
- Modify: `README.md` (feature list, if it enumerates features)

- [ ] **Step 1: Full smoke**

Run: `node test/load-smoke.js`
Expected: PASS with all seven modules listed (`zendesk-selectors`, `customizer-apply`, `zd-styling`, `site-tools-menu`, `workflow-helper`, `workflow-helper-bridge`, plus existing).

- [ ] **Step 2: Full live regression on ticket 11438969**

With Tampermonkey disabled, walk the full checklist from the spec's Testing section: stacking, site tools, all four styling sub-features, all four workflow behaviors, persistence across reload, and confirm no console errors from the new modules.

- [ ] **Step 3: Bump version and changelog**

In `extension/manifest.json` set `"version": "3.2.0"`. Add a `CHANGELOG.md` entry under a new `## 3.2.0` heading summarizing the four integrated modules. Update `README.md`'s feature list if present.

- [ ] **Step 4: Commit**

```bash
git add extension/manifest.json CHANGELOG.md README.md
git commit -m "chore: Release 3.2.0 — integrate ZD styling, site tools, workflow helper, hardened stacking"
```

---

## Self-Review

**Spec coverage:**
- Module 1 (hardened stacking) → Task 2. ✓
- Module 2 (site tools) → Task 4. ✓
- Module 3 (styling) → Task 3. ✓
- Module 4 (workflow helper + bridge) → Task 5. ✓
- Config keys → Task 1. ✓
- Settings UI → Task 6. ✓
- Manifest changes (idle additions, MAIN block, app-iframe block) → Tasks 3/4/5. ✓
- Testing → per-task live-verify + Task 7 regression. ✓
- Version bump/changelog → Task 7. ✓

**Placeholder scan:** Porting steps reference the in-repo source scripts with explicit transformation instructions rather than reproducing ~1500 lines verbatim; all genuinely-new logic (config gating, pane tagging, the bridge, settings wiring, manifest blocks) is shown in full. No TBD/TODO left.

**Type consistency:** Global names consistent (`ZDStyling`, `ZDSiteToolsMenu`, `ZDWorkflowHelper`, `ZDWorkflowHelperBridge`, `ZDCustomizerApply`). Config keys identical across Task 1 (defaults), modules (readers), and Task 6 (form). Bridge attribute `data-zd-workflow-config` and event `zd-workflow-config` consistent between Task 5 files. Pane attribute `data-zd-pane` consistent within Task 2.
