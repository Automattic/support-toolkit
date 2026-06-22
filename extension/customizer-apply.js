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
            apps: { position: 1, width: 'default' },
            conversation: { position: 2, width: 'default' },
            context: { position: 3, width: 'default' }
        },
        // Theme tinting is OFF by default so a fresh install never alters
        // Zendesk's canvas. When enabled, the menu captures the active theme's
        // colors into `colors` so we emit literal values (no dependency on the
        // document_idle theme module, no flash).
        theme: { applyToZendesk: false, colors: null },
        text: { convSize: 'normal', font: 'system', density: 'comfortable' },
        hidden: {} // keys: macroMenu, slaDivider, conversationSubject, searchButton, notificationsButton
    };

    const ROLE_COLUMN = (S.roleColumn) || { apps: 1, conversation: 2, context: 3 };
    const ROLE_ORDER = ['apps', 'conversation', 'context']; // tiebreak for equal positions
    const ROLE_DEFAULT_FR = { apps: 0.85, conversation: 2.4, context: 0.75 };
    const WIDTH_FR = { narrow: 0.7, normal: 1.1, wide: 2.4 };

    const FONT_STACKS = {
        system: null, // no override
        serif: 'Georgia, Cambria, "Times New Roman", serif',
        mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
        rounded: 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif'
    };
    const CONV_SIZE_PX = { small: 12, normal: null, large: 16, xlarge: 18 };

    const HIDE_SELECTORS = {
        macroMenu: S.macroMenu || '[data-test-id="ticket-footer-macro-menu-autocomplete-input"]',
        slaDivider: S.slaDivider || '[data-test-id="sla-divider-wrapper"]',
        conversationSubject: S.conversationSubject || '[data-test-id="omni-header-subject"]',
        searchButton: S.searchButton || '[data-test-id="header-toolbar-search-button"]',
        notificationsButton: S.notificationsButton || '[data-test-id="global-notifications-button"]'
    };

    function paneSel(role) {
        const n = ROLE_COLUMN[role];
        return S.pane ? S.pane(n) : `[data-test-id="column-${n}"]`;
    }

    function isDefaultLayout(layout) {
        return ROLE_ORDER.every((role, i) => {
            const r = layout[role] || {};
            return (r.position == null || r.position === i + 1) &&
                (!r.width || r.width === 'default');
        });
    }

    // --- Layout layer (ticket pages; inert elsewhere since selectors won't match) ---
    function buildLayoutCSS(layout) {
        if (!layout || isDefaultLayout(layout)) return '';

        // Resolve final left-to-right order: sort by position, tiebreak by role order.
        const sorted = ROLE_ORDER
            .map((role) => ({ role, ...layout[role] }))
            .sort((a, b) => {
                const pa = a.position || (ROLE_ORDER.indexOf(a.role) + 1);
                const pb = b.position || (ROLE_ORDER.indexOf(b.role) + 1);
                if (pa !== pb) return pa - pb;
                return ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role);
            });

        const orderRules = sorted.map((r, idx) =>
            `${S.ticketGrid} ${paneSel(r.role)} { order: ${idx + 1} !important; }`
        );

        const tracks = sorted.map((r) => {
            const fr = (!r.width || r.width === 'default')
                ? ROLE_DEFAULT_FR[r.role]
                : (WIDTH_FR[r.width] || 1);
            return fr + 'fr';
        }).join(' ');

        return [
            `${S.ticketGrid} { grid-template-columns: ${tracks} !important; }`,
            ...orderRules
        ].join('\n');
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
            rules.push(`body { background-color: ${background} !important; }`);
            rules.push(`${main} { background-color: transparent !important; }`);
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
        const log = S.conversationLog || '[data-test-id="omni-log"]';

        const stack = FONT_STACKS[text.font];
        if (stack) {
            rules.push(`${log}, ${log} * { font-family: ${stack} !important; }`);
        }

        const px = CONV_SIZE_PX[text.convSize];
        if (px) {
            rules.push(`${log} { font-size: ${px}px !important; }`);
        }

        if (text.density === 'compact') {
            rules.push(`${log} [data-test-id="omni-log-comment-item"] { padding-top: 4px !important; padding-bottom: 4px !important; }`);
            rules.push(`${log} [data-test-id="omni-log-item-message"] { line-height: 1.35 !important; }`);
        }
        return rules.join('\n');
    }

    // --- Hide / show (curated, safe declutter — no functional controls) ---
    function buildHideCSS(hidden) {
        if (!hidden) return '';
        return Object.keys(hidden)
            .filter((k) => hidden[k] && HIDE_SELECTORS[k])
            .map((k) => `${HIDE_SELECTORS[k]} { display: none !important; }`)
            .join('\n');
    }

    // Pure: settings object -> CSS string. Safe on bad input.
    function buildCustomizerCSS(customizer) {
        try {
            const c = customizer || {};
            if (c.enabled === false) return '';
            return [
                buildLayoutCSS(c.layout),
                buildThemeCSS(c.theme),
                buildTextCSS(c.text),
                buildHideCSS(c.hidden)
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
        HIDE_SELECTORS,
        FONT_STACKS
    };

    // Initial application (runs at document_start).
    refresh().catch((e) => warn('initial apply failed', e));
})();
