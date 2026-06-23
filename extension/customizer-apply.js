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
    const pane = (n) => (S.pane ? S.pane(n) : `[data-test-id="column-${n}"]`);
    // Verified column mapping: Notes/apps = column-1, Conversation = column-2,
    // User Info/context = column-3.
    const CONV = pane(2);
    const NOTES = pane(1);
    const INFO = pane(3);

    function warn(msg, e) {
        if (window.console) console.warn('[ZD Layout] ' + msg, e || '');
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
    function buildStackCSS(mode) {
        try {
            if (mode !== 'right' && mode !== 'left') return '';
            // Zendesk's User Info panel fills its space and scrolls internally;
            // it never shrinks to its content. A large row therefore leaves a
            // dead gap under the content, while `auto` collapses and clips it.
            // So we size the top (User Info) row to roughly fit typical content
            // — minimal gap, the rest scrolls — and give Notes the remainder.
            const rows = `${GRID} { grid-template-rows: clamp(300px, 34vh, 420px) minmax(0, 1fr) !important; }`;
            if (mode === 'left') {
                // Sidebars in track 1; conversation spans tracks 2–3.
                return [
                    rows,
                    `${GRID} ${INFO} { grid-column: 1 !important; grid-row: 1 !important; order: 0 !important; }`,
                    `${GRID} ${NOTES} { grid-column: 1 !important; grid-row: 2 !important; order: 0 !important; }`,
                    `${GRID} ${CONV} { grid-column: 2 / -1 !important; grid-row: 1 / -1 !important; order: 0 !important; }`
                ].join('\n');
            }
            // Right: conversation spans tracks 1–2; sidebars in track 3.
            return [
                rows,
                `${GRID} ${CONV} { grid-column: 1 / 3 !important; grid-row: 1 / -1 !important; order: 0 !important; }`,
                `${GRID} ${INFO} { grid-column: 3 !important; grid-row: 1 !important; order: 0 !important; }`,
                `${GRID} ${NOTES} { grid-column: 3 !important; grid-row: 2 !important; order: 0 !important; }`
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
        injectCSS(buildStackCSS(cfg && cfg.stackSidebars));
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
