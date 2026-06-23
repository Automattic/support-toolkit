// Customizer applier — turns saved settings into one injected stylesheet.
//
// Runs at document_start (its own content-script entry) so layout/appearance
// land before Zendesk paints, minimizing flash/reflow. Every rule targets a
// self-scoping selector (e.g. `.ticket-panes-grid-layout` only exists on
// ticket pages), so a single stylesheet works on every page and the browser
// re-matches automatically on SPA navigation — no route observer required.
//
// Dependency-light: reads chrome.storage directly and uses ZDZendeskSelectors
// (loaded just before this). It does NOT depend on the document_idle modules.

(function () {
    'use strict';

    const STYLE_ID = 'zd-customizer-styles';
    const CONFIG_KEY = 'ZDCounter-config'; // STORAGE_KEYS.CONFIG
    const S = window.ZDZendeskSelectors || {};

    function warn(msg, e) {
        if (window.console) console.warn('[Customizer] ' + msg, e || '');
    }

    const DEFAULT_CUSTOMIZER = {
        enabled: true,
        layout: {
            apps: { position: 1, width: 'default', hidden: false },
            conversation: { position: 2, width: 'default', hidden: false },
            context: { position: 3, width: 'default', hidden: false }
        },
        // Theme tinting is OFF by default so a fresh install never alters
        // Zendesk's canvas. When enabled, the menu captures the active theme's
        // colors into `colors` so we emit literal values (no dependency on the
        // document_idle theme module, no flash).
        theme: { applyToZendesk: false, colors: null },
        text: { convSize: 'normal', font: 'system', density: 'comfortable' }
    };

    const ROLE_COLUMN = (S.roleColumn) || { apps: 1, conversation: 2, context: 3 };
    const ROLE_ORDER = ['apps', 'conversation', 'context']; // left→right tiebreak for equal columns
    const STACK_ORDER = ['conversation', 'context', 'apps']; // top→bottom order when panes share a column
    const ROLE_DEFAULT_FR = { apps: 0.85, conversation: 2.4, context: 0.75 };
    const WIDTH_FR = { narrow: 0.7, normal: 1.1, wide: 2.4 };

    const FONT_STACKS = {
        system: null, // no override
        serif: 'Georgia, Cambria, "Times New Roman", serif',
        mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
        rounded: 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif'
    };
    const CONV_SIZE_PX = { small: 12, normal: null, large: 16, xlarge: 18 };

    function paneSel(role) {
        const n = ROLE_COLUMN[role];
        return S.pane ? S.pane(n) : `[data-test-id="column-${n}"]`;
    }

    function isDefaultLayout(layout) {
        return ROLE_ORDER.every((role, i) => {
            const r = layout[role] || {};
            return (r.position == null || r.position === i + 1) &&
                (!r.width || r.width === 'default') &&
                !r.hidden;
        });
    }

    // --- Layout layer (ticket pages; inert elsewhere since selectors won't match) ---
    //
    // Two paths:
    //  • Plain reorder (3 distinct columns, default widths, no stacking/hide):
    //    emit ONLY `order`. We don't touch grid-template-columns, so Zendesk's
    //    inline track sizes — and its native drag-resize — keep working.
    //  • Restructured (panes stacked in a column, a pane hidden, or a custom
    //    width): we define grid-template-columns/rows explicitly and place each
    //    pane. Native drag-resize is replaced by the Width control here.
    function buildLayoutCSS(layout) {
        if (!layout || isDefaultLayout(layout)) return '';

        const colOf = (r) => r.position || (ROLE_COLUMN[r.role] || (ROLE_ORDER.indexOf(r.role) + 1));

        const all = ROLE_ORDER.map((role) => ({ role, ...layout[role] }));
        const hidden = all.filter((r) => r.hidden);
        const visible = all.filter((r) => !r.hidden);

        const rules = hidden.map((r) =>
            `${S.ticketGrid} ${paneSel(r.role)} { display: none !important; }`
        );

        // Group visible panes by their assigned column.
        const byCol = {};
        visible.forEach((r) => { (byCol[colOf(r)] = byCol[colOf(r)] || []).push(r); });
        const usedCols = Object.keys(byCol).map(Number).sort((a, b) => a - b);
        // left→right tiebreak within ties is implicit (single pane per column here)
        usedCols.forEach((c) => byCol[c].sort((a, b) =>
            STACK_ORDER.indexOf(a.role) - STACK_ORDER.indexOf(b.role)));

        const maxStack = Math.max(1, ...usedCols.map((c) => byCol[c].length));
        const customWidth = visible.some((r) => r.width && r.width !== 'default');
        const restructured = maxStack > 1 || usedCols.length !== 3 || customWidth;

        if (!restructured) {
            // Plain reorder — preserve native resize.
            usedCols.forEach((c, idx) => {
                byCol[c].forEach((r) => rules.push(
                    `${S.ticketGrid} ${paneSel(r.role)} { order: ${idx + 1} !important; }`));
            });
            return rules.join('\n');
        }

        // Restructured: explicit grid template + placement.
        const trackFor = (c) => {
            const rs = byCol[c];
            const explicit = rs.map((r) => r.width).find((w) => w && w !== 'default');
            if (explicit) return WIDTH_FR[explicit] + 'fr';
            if (rs.some((r) => r.role === 'conversation')) return ROLE_DEFAULT_FR.conversation + 'fr';
            return (ROLE_DEFAULT_FR[rs[0].role] || 1) + 'fr';
        };
        const tracks = usedCols.map(trackFor).join(' ');
        let gridDecl = `grid-template-columns: ${tracks} !important;`;
        if (maxStack > 1) gridDecl += ` grid-template-rows: repeat(${maxStack}, minmax(0, 1fr)) !important;`;
        rules.push(`${S.ticketGrid} { ${gridDecl} }`);

        usedCols.forEach((c, colIdx) => {
            const rs = byCol[c];
            if (maxStack > 1 && rs.length === 1) {
                // Single pane in a stacked layout spans all rows (full height).
                rules.push(`${S.ticketGrid} ${paneSel(rs[0].role)} { grid-column: ${colIdx + 1} !important; grid-row: 1 / -1 !important; order: 0 !important; }`);
            } else {
                rs.forEach((r, rowIdx) => {
                    let decl = `grid-column: ${colIdx + 1} !important; order: 0 !important;`;
                    if (maxStack > 1) decl += ` grid-row: ${rowIdx + 1} !important;`;
                    rules.push(`${S.ticketGrid} ${paneSel(r.role)} { ${decl} }`);
                });
            }
        });
        return rules.join('\n');
    }

    // --- Theme bridge (all pages): tint the canvas + header using --zd-* tokens.
    // Panes/cards keep their own backgrounds, so readability is preserved. ---
    // Defense-in-depth: independently validate any color before interpolating
    // it into the stylesheet. chrome.storage.sync can carry values written by
    // another device or an older extension build, so the sink must not trust
    // the menu-side sanitizer. Reject CSS-breaking characters outright, then
    // confirm the browser's parser accepts it as a color.
    function safeCssColor(v) {
        if (typeof v !== 'string' || !v || v.length > 64) return null;
        if (/[;{}<>]/.test(v) || v.indexOf('/*') !== -1 || /url\(/i.test(v)) return null;
        try {
            if (window.CSS && CSS.supports && !CSS.supports('color', v)) return null;
        } catch (e) { return null; }
        return v;
    }

    function buildThemeCSS(theme) {
        // Opt-in only, and only with concrete captured colors — never emit a
        // `transparent` fallback that would expose the browser canvas.
        if (!theme || theme.applyToZendesk !== true) return '';
        const colors = theme.colors || {};
        const background = safeCssColor(colors.background);
        const primary = safeCssColor(colors.primary);
        if (!background && !primary) return '';
        const header = S.header || 'header[data-test-id="header-toolbar"]';
        const main = S.mainContent || 'main[data-garden-id="navigation.main"]';
        const rules = [];
        if (background) {
            // Tint the canvas + the major structural surfaces (top bar, left
            // nav rail, conversation pane, footer/composer bar). These are all
            // chrome containers; message bubbles, cards and inputs keep their
            // own styling, so text contrast is preserved.
            const surfaces = [
                'body',
                main,
                header,
                'nav[data-test-id="support_nav"]',
                '[data-test-id="ticket-main-conversation"]',
                '[data-test-id="ticket-footer"]'
            ].join(', ');
            rules.push(`${surfaces} { background-color: ${background} !important; }`);
        }
        if (primary) {
            rules.push(`${header} { border-bottom: 2px solid ${primary} !important; }`);
        }
        return rules.join('\n');
    }

    // --- Text & density (conversation area — the most-read surface) ---
    function buildTextCSS(text) {
        if (!text) return '';
        const rules = [];
        const item = S.conversationItem || '[data-test-id="omni-log-comment-item"]';
        const message = S.conversationMessage || '[data-test-id="omni-log-item-message"]';

        // Font applies to the whole message item (names, timestamps, body) so
        // the conversation reads as one typeface.
        const stack = FONT_STACKS[text.font];
        if (stack) {
            rules.push(`${item}, ${item} * { font-family: ${stack} !important; }`);
        }

        // Size targets the message body text specifically.
        const px = CONV_SIZE_PX[text.convSize];
        if (px) {
            rules.push(`${message}, ${message} * { font-size: ${px}px !important; }`);
        }

        if (text.density === 'compact') {
            rules.push(`${item} { padding-top: 4px !important; padding-bottom: 4px !important; }`);
            rules.push(`${message} { line-height: 1.35 !important; }`);
        }
        return rules.join('\n');
    }

    // Pure: settings object -> CSS string. Safe on bad input.
    // (Hiding is now per-pane via layout[role].hidden — see buildLayoutCSS.)
    function buildCustomizerCSS(customizer) {
        try {
            const c = customizer || {};
            if (c.enabled === false) return '';
            return [
                buildLayoutCSS(c.layout),
                buildThemeCSS(c.theme),
                buildTextCSS(c.text)
            ].filter(Boolean).join('\n\n');
        } catch (e) {
            // Never let a styling error break the page.
            warn('buildCSS failed', e);
            return '';
        }
    }

    function injectCSS(css) {
        let el = document.getElementById(STYLE_ID);
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
        const customizer = (cfg && cfg.customizer) || DEFAULT_CUSTOMIZER;
        injectCSS(buildCustomizerCSS(customizer));
    }

    // Live-update when settings are saved (menu writes config → storage change).
    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'sync' && changes[CONFIG_KEY]) {
                refresh().catch((e) => warn('live refresh failed', e));
            }
        });
    } catch (e) {
        // Live preview won't auto-update, but the menu also calls refresh()
        // directly. Leave a breadcrumb rather than failing silently.
        warn('storage.onChanged unavailable', e);
    }

    window.ZDCustomizerApply = {
        refresh,
        buildCustomizerCSS,
        DEFAULT_CUSTOMIZER,
        FONT_STACKS
    };

    // Initial application (runs at document_start).
    refresh().catch((e) => warn('initial apply failed', e));
})();
