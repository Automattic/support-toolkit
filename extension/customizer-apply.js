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
    const INFO_SEL = `[${PANE_ATTR}="info"]`;

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
    const NOTES_MAX = '60vh'; // cap so a long note scrolls instead of squashing the sidebar

    function buildStackCSS(mode) {
        try {
            if (mode !== 'right' && mode !== 'left') return '';
            // The top (User Info) row height is driven by --zd-stack-top, which
            // the draggable divider (see row-resizer below) updates and
            // persists. Default 420px until the user drags it.
            const rows = `${GRID} { grid-template-rows: var(--zd-stack-top, 420px) minmax(0, 1fr) !important; }`;
            const notesCap = `${P_NOTES} { min-height: 0 !important; max-height: ${NOTES_MAX} !important; overflow-y: auto !important; }`;
            if (mode === 'left') {
                // Sidebars in track 1; conversation spans tracks 2–3.
                return [
                    rows, notesCap,
                    `${P_INFO} { grid-column: 1 !important; grid-row: 1 !important; order: 0 !important; }`,
                    `${P_NOTES} { grid-column: 1 !important; grid-row: 2 !important; order: 0 !important; }`,
                    `${P_CONV} { grid-column: 2 / -1 !important; grid-row: 1 / -1 !important; order: 0 !important; }`
                ].join('\n');
            }
            // Right: conversation spans tracks 1–2; sidebars in track 3.
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

    // --- Draggable divider between the two stacked sidebar panes ---------
    // Zendesk has no native handle for stacked panes, so we overlay our own.
    // It drives --zd-stack-top (the User Info row height) live and persists the
    // chosen height so the User Info / Notes split is the agent's to decide.
    const HANDLE_ID = 'zd-stack-row-resizer';
    const MIN_ROW = 140; // px floor for each stacked pane
    const DEFAULT_TOP = 420;

    let stackingActive = false;
    let storedTop = DEFAULT_TOP;
    let dragging = false;
    let rafQueued = false;

    function getHandle() {
        let h = document.getElementById(HANDLE_ID);
        if (!h) {
            h = document.createElement('div');
            h.id = HANDLE_ID;
            Object.assign(h.style, {
                position: 'fixed', display: 'none', zIndex: 999999998,
                cursor: 'row-resize', alignItems: 'center', justifyContent: 'center'
            });
            const grip = document.createElement('div');
            grip.style.cssText = 'width:44px;height:4px;border-radius:3px;background:rgba(140,150,170,0.5);transition:background .12s ease;';
            h.appendChild(grip);
            h.addEventListener('mouseenter', () => { grip.style.background = 'var(--zd-primary, rgba(140,150,170,0.9))'; });
            h.addEventListener('mouseleave', () => { if (!dragging) grip.style.background = 'rgba(140,150,170,0.5)'; });
            h.addEventListener('mousedown', onDragStart);
            (document.body || document.documentElement).appendChild(h);
        }
        return h;
    }

    function positionHandle() {
        const h = document.getElementById(HANDLE_ID);
        if (!stackingActive) { if (h) h.style.display = 'none'; return; }
        const grid = document.querySelector(GRID);
        const info = document.querySelector(INFO_SEL);
        if (!grid || !info) { if (h) h.style.display = 'none'; return; }
        // Set the stored height once when the grid first appears.
        if (!dragging && !grid.style.getPropertyValue('--zd-stack-top')) {
            grid.style.setProperty('--zd-stack-top', storedTop + 'px');
        }
        const handle = getHandle();
        const r = info.getBoundingClientRect();
        handle.style.left = r.left + 'px';
        handle.style.width = r.width + 'px';
        handle.style.top = (r.bottom - 5) + 'px';
        handle.style.height = '10px';
        handle.style.display = 'flex';
    }

    function loop() {
        rafQueued = false;
        if (!stackingActive) return;
        if (!dragging) positionHandle();
        scheduleLoop();
    }
    function scheduleLoop() {
        if (rafQueued || !stackingActive) return;
        rafQueued = true;
        requestAnimationFrame(loop);
    }

    function onDragStart(e) {
        const grid = document.querySelector(GRID);
        if (!grid) return;
        e.preventDefault();
        dragging = true;
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onDragMove, true);
        document.addEventListener('mouseup', onDragEnd, true);
    }
    function onDragMove(e) {
        const grid = document.querySelector(GRID);
        if (!grid) return;
        const gr = grid.getBoundingClientRect();
        let top = e.clientY - gr.top;
        top = Math.max(MIN_ROW, Math.min(top, gr.height - MIN_ROW));
        grid.style.setProperty('--zd-stack-top', Math.round(top) + 'px');
        positionHandle();
    }
    function onDragEnd() {
        dragging = false;
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onDragMove, true);
        document.removeEventListener('mouseup', onDragEnd, true);
        const grid = document.querySelector(GRID);
        const top = grid && parseInt(grid.style.getPropertyValue('--zd-stack-top'), 10);
        if (top) {
            storedTop = top;
            // Persist via ZDStorage (loaded by now; merges + updates its cache).
            if (window.ZDStorage && window.ZDStorage.setConfig) {
                window.ZDStorage.setConfig({ stackTopPx: top }).catch(() => {});
            }
        }
    }

    async function refresh() {
        const cfg = await readConfig();
        const mode = cfg && cfg.stackSidebars;
        storedTop = (cfg && cfg.stackTopPx) || DEFAULT_TOP;
        injectCSS(buildStackCSS(mode));
        stackingActive = (mode === 'right' || mode === 'left');
        // The layout CSS matches on data-zd-pane tags — start the tagger so the
        // panes get tagged (and stay tagged as Zendesk re-renders).
        if (stackingActive) startTagObserver();
        const grid = document.querySelector(GRID);
        if (grid && !dragging) grid.style.setProperty('--zd-stack-top', storedTop + 'px');
        if (stackingActive) scheduleLoop(); else positionHandle();
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

    window.addEventListener('resize', () => { if (stackingActive) positionHandle(); });

    window.ZDCustomizerApply = { refresh, buildStackCSS };

    // Initial application (runs at document_start).
    refresh().catch((e) => warn('initial apply failed', e));
})();
