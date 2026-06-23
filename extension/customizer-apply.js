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

    // Pure: stacking mode -> CSS string. Conversation takes one tall column
    // (full height); User Info sits above Notes in the other column.
    function buildStackCSS(mode) {
        try {
            if (mode !== 'right' && mode !== 'left') return '';
            const convCol = mode === 'right' ? 1 : 2;
            const sideCol = mode === 'right' ? 2 : 1;
            const tracks = mode === 'right' ? '2.4fr 1fr' : '1fr 2.4fr';
            return [
                `${GRID} { grid-template-columns: ${tracks} !important; grid-template-rows: repeat(2, minmax(0, 1fr)) !important; }`,
                `${GRID} ${CONV} { grid-column: ${convCol} !important; grid-row: 1 / -1 !important; order: 0 !important; }`,
                `${GRID} ${INFO} { grid-column: ${sideCol} !important; grid-row: 1 !important; order: 0 !important; }`,
                `${GRID} ${NOTES} { grid-column: ${sideCol} !important; grid-row: 2 !important; order: 0 !important; }`
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
