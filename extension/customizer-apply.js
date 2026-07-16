// Zendesk sidebar stacking.
//
// Stacks the two sidebar panes (User Info + Notes) vertically into one tall
// column beside the conversation, reclaiming the wasted horizontal space when
// they'd otherwise sit side by side. Driven by a single setting
// `config.stackSidebars` = 'off' | 'right' | 'left' (set in the gear Settings).
//
// Runs at document_start so it lands before paint. Emits one self-scoping
// <style>; since every rule targets `.ticket-panes-grid-layout` (ticket pages
// only), it's inert elsewhere and the browser re-matches on SPA navigation —
// no route observer needed. Re-applies when the setting changes in storage.
//
// Dependency-light: reads chrome.storage directly and uses ZDZendeskSelectors.

(function () {
    'use strict';

    const STYLE_ID = 'zd-customizer-styles';
    const CONFIG_KEY = 'ZDCounter-config'; // STORAGE_KEYS.CONFIG
    const S = window.ZDZendeskSelectors || {};

    const GRID = S.ticketGrid || '.ticket-panes-grid-layout';

    function warn(msg, e) {
        if (window.console) console.warn('[ZD Layout] ' + msg, e || '');
    }

    // --- Content-based pane tagging ------------------------------------------
    // The ticket grid is a CUSTOM layout: pane ORDER is configured per-agent and
    // is NOT guaranteed (verified live 2026-07-15). So we never assume column-N;
    // instead we find the column that actually CONTAINS the notes app and the one
    // holding the ContextPanel, and tag each pane with data-zd-pane. The layout
    // CSS keys off those tags, so stacking is correct under any column order.
    // Pure tagging — no DOM is ever moved (that would break Zendesk's cross-tab
    // app-iframe pool).
    const PANE_ATTR = 'data-zd-pane';
    const NOTES_IFRAME = 'iframe[title="a8cnotes"]';
    const APP_ELEMENT = '[data-test-id="app-element"]';
    const CONTEXT_PANEL = '[data-test-id="component-type-ContextPanel"]';
    const LAYOUT_COLUMN = '[data-test-id^="column-"]';
    const GRID_ANY = '[data-test-id$="-custom-layout"]';
    // Cap for an unusually long note so User Info is never squeezed away; the
    // note scrolls past this. Normal notes stay under it and show in full.
    const NOTES_MAX = '60vh';

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

    function setPane(col, value) {
        if (col.getAttribute(PANE_ATTR) !== value) col.setAttribute(PANE_ATTR, value);
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

    function tagAll() {
        document.querySelectorAll(GRID_ANY).forEach(tagGrid);
    }

    let tagScheduled = false;
    function scheduleTag() {
        if (tagScheduled) return;
        tagScheduled = true;
        Promise.resolve().then(() => { tagScheduled = false; tagAll(); });
    }

    let tagObserverOn = false;
    function startTagObserver() {
        if (tagObserverOn) return;
        tagObserverOn = true;
        tagAll();
        const mo = new MutationObserver(scheduleTag);
        const root = document.querySelector('main#main_panes') || document.body || document.documentElement;
        mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleTag(); });
    }

    // Pure: stacking mode -> CSS string.
    //
    // We deliberately do NOT override grid-template-columns: Zendesk stores its
    // column widths as inline fr values and its drag-to-resize updates them, so
    // leaving them alone keeps native resize working. Instead we stack the two
    // sidebars into one of Zendesk's existing side tracks and let the
    // conversation span the other two tracks. User Info sits on top with the
    // larger share (its content is scrollable, so more height = more info);
    // Notes sits beneath it.
    //
    // Rules target the data-zd-pane tags (set by tagGrid), never column-N, so
    // the correct panes are placed regardless of the custom-layout column order.
    const P_NOTES = `${GRID} [${PANE_ATTR}="notes"]`;
    const P_INFO = `${GRID} [${PANE_ATTR}="info"]`;
    const P_CONV = `${GRID} [${PANE_ATTR}="conversation"]`;

    function buildStackCSS(mode) {
        try {
            if (mode !== 'right' && mode !== 'left') return '';
            // Notes sits on TOP, sized to its own content (grid-row auto): a short
            // note takes little height, a long one takes more. User Info fills all
            // the remaining height below and scrolls internally. No manual resize
            // — the split follows the note. NOTES_MAX caps an unusually long note
            // (it scrolls past that) so User Info can never be squeezed away.
            // Gate the row template on a tagged notes pane. The grid class
            // (.ticket-panes-grid-layout) is shared by the NEW-ticket
            // "-standard-layout" grid, which never gets tagged (tagging only
            // runs on "-custom-layout" grids); without this gate the forced
            // rows collapsed that page. :has() keeps it to real stacked grids.
            const rows = `${GRID}:has([${PANE_ATTR}="notes"]) { grid-template-rows: auto minmax(0, 1fr) !important; }`;
            const notesCap = `${P_NOTES} { min-height: 0 !important; max-height: ${NOTES_MAX} !important; overflow-y: auto !important; }`;
            const infoScroll = `${P_INFO} { min-height: 0 !important; overflow-y: auto !important; }`;
            if (mode === 'left') {
                // Sidebars in track 1; conversation spans tracks 2–3.
                return [
                    rows, notesCap, infoScroll,
                    `${P_NOTES} { grid-column: 1 !important; grid-row: 1 !important; order: 0 !important; }`,
                    `${P_INFO} { grid-column: 1 !important; grid-row: 2 !important; order: 0 !important; }`,
                    `${P_CONV} { grid-column: 2 / -1 !important; grid-row: 1 / -1 !important; order: 0 !important; }`
                ].join('\n');
            }
            // Right: conversation spans tracks 1–2; sidebars in track 3.
            return [
                rows, notesCap, infoScroll,
                `${P_CONV} { grid-column: 1 / 3 !important; grid-row: 1 / -1 !important; order: 0 !important; }`,
                `${P_NOTES} { grid-column: 3 !important; grid-row: 1 !important; order: 0 !important; }`,
                `${P_INFO} { grid-column: 3 !important; grid-row: 2 !important; order: 0 !important; }`
            ].join('\n');
        } catch (e) {
            warn('buildStackCSS failed', e);
            return '';
        }
    }

    function injectCSS(css) {
        let el = document.getElementById(STYLE_ID);
        if (!css) { if (el) el.textContent = ''; return; }
        if (!el) {
            el = document.createElement('style');
            el.id = STYLE_ID;
            (document.head || document.documentElement).appendChild(el);
        }
        if (el.textContent !== css) el.textContent = css;
    }

    function readConfig() {
        return new Promise((resolve) => {
            try {
                chrome.storage.sync.get([CONFIG_KEY], (res) => {
                    if (chrome.runtime && chrome.runtime.lastError) return resolve(null);
                    resolve((res && res[CONFIG_KEY]) || null);
                });
            } catch (e) {
                resolve(null);
            }
        });
    }

    async function refresh() {
        const cfg = await readConfig();
        const mode = cfg && cfg.stackSidebars;
        injectCSS(buildStackCSS(mode));
        // The layout CSS matches on data-zd-pane tags — start the tagger so the
        // panes get tagged (and stay tagged as Zendesk re-renders / tabs switch).
        if (mode === 'right' || mode === 'left') startTagObserver();
    }

    // Re-apply when the setting is saved.
    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'sync' && changes[CONFIG_KEY]) {
                refresh().catch((e) => warn('live refresh failed', e));
            }
        });
    } catch (e) {
        warn('storage.onChanged unavailable', e);
    }

    window.ZDCustomizerApply = { refresh, buildStackCSS };

    // Initial application (runs at document_start).
    refresh().catch((e) => warn('initial apply failed', e));
})();
