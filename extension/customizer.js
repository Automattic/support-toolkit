// Customize Zendesk — the in-toolbar menu for reshaping the workspace.
//
// A compact floating panel (not a full-screen modal) so the ticket stays
// visible and changes preview live as you tweak. Writes settings to
// config.customizer; the document_start applier (customizer-apply.js) reacts
// to the storage change and re-injects the stylesheet. Styled with the same
// tokens/classes as the rest of the toolbar. No emojis — titles only.

(function () {
    'use strict';

    const { logError } = window.ZDErrorHandler || { logError: console.error };

    function toast(msg, type, ms) {
        if (window.ZDNotifyUtils && window.ZDNotifyUtils.showToast) {
            window.ZDNotifyUtils.showToast(msg, type || 'info', ms || 2500);
        }
    }

    // Capture the active theme's resolved colors so the applier can emit
    // literal values (no dependency on the document_idle theme module).
    // Only accepts well-formed color strings.
    function captureThemeColors() {
        try {
            const cs = getComputedStyle(document.documentElement);
            const bg = (cs.getPropertyValue('--zd-background') || '').trim();
            const primary = (cs.getPropertyValue('--zd-primary') || '').trim();
            const ok = (v) => /^(#|rgb|hsl)/i.test(v);
            const colors = {};
            if (ok(bg)) colors.background = bg;
            if (ok(primary)) colors.primary = primary;
            return (colors.background || colors.primary) ? colors : null;
        } catch (e) {
            return null;
        }
    }

    const ROLE_LABELS = {
        conversation: 'Conversation',
        apps: 'Notes (a8cnotes)',
        context: 'User Info / Context'
    };
    // Display order of the rows in the Layout tab.
    const ROLE_ROWS = ['conversation', 'apps', 'context'];

    const WIDTH_OPTIONS = [
        ['default', 'Default'], ['narrow', 'Narrow'],
        ['normal', 'Normal'], ['wide', 'Wide']
    ];
    const FONT_OPTIONS = [
        ['system', 'System'], ['serif', 'Serif'],
        ['mono', 'Mono'], ['rounded', 'Rounded']
    ];
    const CONV_SIZE_OPTIONS = [
        ['small', 'Small'], ['normal', 'Normal'],
        ['large', 'Large'], ['xlarge', 'Extra large']
    ];
    const HIDE_OPTIONS = [
        ['macroMenu', 'Apply-macro bar'],
        ['slaDivider', 'SLA badge'],
        ['conversationSubject', 'Conversation subject header'],
        ['searchButton', 'Global search button'],
        ['notificationsButton', 'Notifications bell']
    ];
    const PRESETS = [
        ['default', 'Default'],
        ['swap', 'Swap sidebars'],
        ['both-right', 'Both sidebars right']
    ];

    let panelEl = null;
    let working = null;       // in-memory working copy of config.customizer
    let activeTab = 'layout';
    let outsideHandler = null;

    function defaults() {
        const d = (window.ZDCustomizerApply && window.ZDCustomizerApply.DEFAULT_CUSTOMIZER) || {};
        return JSON.parse(JSON.stringify(d));
    }

    // Deep-merge stored config over defaults so missing keys are filled in.
    function mergeDefaults(stored) {
        const base = defaults();
        const c = stored || {};
        return {
            enabled: c.enabled !== false,
            layout: Object.assign({}, base.layout, deepLayout(base.layout, c.layout)),
            theme: Object.assign({}, base.theme, c.theme),
            text: Object.assign({}, base.text, c.text),
            hidden: Object.assign({}, base.hidden, c.hidden)
        };
    }
    function deepLayout(baseLayout, layout) {
        const out = {};
        Object.keys(baseLayout).forEach((role) => {
            out[role] = Object.assign({}, baseLayout[role], (layout && layout[role]) || {});
        });
        return out;
    }

    async function persistAndApply() {
        try {
            await window.ZDStorage.setConfig({ customizer: working });
            if (window.ZDCustomizerApply && window.ZDCustomizerApply.refresh) {
                window.ZDCustomizerApply.refresh();
            } else {
                logError(new Error('ZDCustomizerApply.refresh unavailable'),
                    { category: 'UI', context: 'customizer-apply-missing' });
            }
        } catch (e) {
            // The control already shows the new value; tell the user it may
            // not have saved so they aren't surprised by a silent revert.
            logError(e, { category: 'UI', context: 'customizer-persist' });
            toast('Could not save your customization — it may not persist.', 'error', 3000);
        }
    }

    // --- small DOM builders ---
    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function select(options, value, onChange) {
        const s = el('select', 'zd-customizer-select');
        options.forEach(([val, label]) => {
            const o = el('option', null, label);
            o.value = val;
            if (val === value) o.selected = true;
            s.appendChild(o);
        });
        s.addEventListener('change', () => {
            Promise.resolve(onChange(s.value)).catch((e) =>
                logError(e, { category: 'UI', context: 'customizer-onchange' }));
        });
        return s;
    }
    function checkbox(checked, label, onChange) {
        const wrap = el('label', 'zd-setting-check');
        const input = el('input');
        input.type = 'checkbox';
        input.checked = !!checked;
        input.addEventListener('change', () => {
            Promise.resolve(onChange(input.checked)).catch((e) =>
                logError(e, { category: 'UI', context: 'customizer-onchange' }));
        });
        wrap.appendChild(input);
        wrap.appendChild(el('span', null, label));
        return wrap;
    }

    // --- tab bodies ---
    function buildLayoutTab() {
        const body = el('div', 'zd-customizer-tabbody');
        body.appendChild(tabHint('Assign any pane to any position and width. Applies to ticket pages.'));

        ROLE_ROWS.forEach((role) => {
            const row = el('div', 'zd-customizer-lrow');
            row.appendChild(el('div', 'zd-customizer-lrow-label', ROLE_LABELS[role]));

            const controls = el('div', 'zd-customizer-lrow-controls');

            const posWrap = el('span', 'zd-customizer-control');
            posWrap.appendChild(el('span', 'zd-customizer-control-label', 'Position'));
            posWrap.appendChild(select(
                [['1', '1'], ['2', '2'], ['3', '3']],
                String(working.layout[role].position || ''),
                (v) => { working.layout[role].position = Number(v); persistAndApply(); }
            ));
            controls.appendChild(posWrap);

            const widthWrap = el('span', 'zd-customizer-control');
            widthWrap.appendChild(el('span', 'zd-customizer-control-label', 'Width'));
            widthWrap.appendChild(select(
                WIDTH_OPTIONS,
                working.layout[role].width || 'default',
                (v) => { working.layout[role].width = v; persistAndApply(); }
            ));
            controls.appendChild(widthWrap);

            row.appendChild(controls);
            body.appendChild(row);
        });

        const presetWrap = el('div', 'zd-customizer-presets');
        PRESETS.forEach(([id, label]) => {
            const b = el('button', 'zd-btn-secondary zd-customizer-preset', label);
            b.addEventListener('click', () => applyPreset(id));
            presetWrap.appendChild(b);
        });
        body.appendChild(presetWrap);
        return body;
    }

    function applyPreset(id) {
        const layout = working.layout;
        // role → default column position: apps=1, conversation=2, context=3
        if (id === 'default') {
            layout.apps.position = 1; layout.conversation.position = 2; layout.context.position = 3;
            ROLE_ROWS.forEach((r) => { layout[r].width = 'default'; });
        } else if (id === 'swap') {
            // context to the left, notes to the right
            layout.context.position = 1; layout.conversation.position = 2; layout.apps.position = 3;
        } else if (id === 'both-right') {
            layout.conversation.position = 1; layout.apps.position = 2; layout.context.position = 3;
        }
        persistAndApply();
        renderTab(); // reflect new select values
    }

    function buildThemeTab() {
        const body = el('div', 'zd-customizer-tabbody');
        body.appendChild(tabHint('Theme and size apply across every Zendesk page.'));

        body.appendChild(checkbox(
            working.theme.applyToZendesk === true,
            'Apply theme colors to Zendesk',
            (v) => {
                working.theme.applyToZendesk = v;
                // Snapshot the current theme's colors so the applier emits
                // literal values (no flash, no idle-module dependency).
                if (v) working.theme.colors = captureThemeColors();
                persistAndApply();
            }
        ));

        // Reuse the shared theme presets for theme / dark / size.
        if (window.ZDThemePresets) {
            const tp = window.ZDThemePresets;
            const presets = tp.getThemePresets ? tp.getThemePresets() : {};
            const sizes = tp.getSizePresets ? tp.getSizePresets() : {};

            const themeRow = el('div', 'zd-customizer-row');
            themeRow.appendChild(el('span', 'zd-customizer-row-label', 'Theme'));
            themeRow.appendChild(select(
                Object.keys(presets).map((id) => [id, presets[id].name || id]),
                currentThemeId(),
                async (v) => { await applyThemePreset({ theme: v }); }
            ));
            body.appendChild(themeRow);

            const sizeRow = el('div', 'zd-customizer-row');
            sizeRow.appendChild(el('span', 'zd-customizer-row-label', 'Size'));
            sizeRow.appendChild(select(
                Object.keys(sizes).map((id) => [id, sizes[id].name || id]),
                currentSizeId(),
                async (v) => { await applyThemePreset({ size: v }); }
            ));
            body.appendChild(sizeRow);

            body.appendChild(checkbox(
                isDark(),
                'Dark mode',
                async (v) => { await applyThemePreset({ dark: v }); }
            ));
        }
        return body;
    }

    let cachedCfg = {};
    function currentThemeId() { return cachedCfg.currentTheme || 'default'; }
    function currentSizeId() { return cachedCfg.currentSize || 'normal'; }
    function isDark() { return cachedCfg.theme === 'dark'; }
    async function applyThemePreset({ theme, size, dark }) {
        const tp = window.ZDThemePresets;
        if (!tp || !tp.applyTheme) {
            logError(new Error('ZDThemePresets.applyTheme unavailable'),
                { category: 'UI', context: 'customizer-theme' });
            toast('Theme could not be applied.', 'error', 2500);
            return;
        }
        const themeId = theme != null ? theme : currentThemeId();
        const sizeId = size != null ? size : currentSizeId();
        const darkOn = dark != null ? dark : isDark();
        try {
            await tp.applyTheme(themeId, darkOn, sizeId);
        } catch (e) {
            logError(e, { category: 'UI', context: 'customizer-theme-apply' });
            toast('Theme could not be applied.', 'error', 2500);
            return;
        }
        cachedCfg.currentTheme = themeId;
        cachedCfg.currentSize = sizeId;
        cachedCfg.theme = darkOn ? 'dark' : 'light';
        // Re-snapshot colors so Zendesk tinting tracks the new theme.
        if (working.theme.applyToZendesk) {
            working.theme.colors = captureThemeColors();
            await persistAndApply();
        }
    }

    function buildTextTab() {
        const body = el('div', 'zd-customizer-tabbody');
        body.appendChild(tabHint('Tunes the conversation area — the surface you read all day.'));

        const fontRow = el('div', 'zd-customizer-row');
        fontRow.appendChild(el('span', 'zd-customizer-row-label', 'Font'));
        fontRow.appendChild(select(FONT_OPTIONS, working.text.font || 'system',
            (v) => { working.text.font = v; persistAndApply(); }));
        body.appendChild(fontRow);

        const sizeRow = el('div', 'zd-customizer-row');
        sizeRow.appendChild(el('span', 'zd-customizer-row-label', 'Text size'));
        sizeRow.appendChild(select(CONV_SIZE_OPTIONS, working.text.convSize || 'normal',
            (v) => { working.text.convSize = v; persistAndApply(); }));
        body.appendChild(sizeRow);

        const densityRow = el('div', 'zd-customizer-row');
        densityRow.appendChild(el('span', 'zd-customizer-row-label', 'Density'));
        densityRow.appendChild(select(
            [['comfortable', 'Comfortable'], ['compact', 'Compact']],
            working.text.density || 'comfortable',
            (v) => { working.text.density = v; persistAndApply(); }));
        body.appendChild(densityRow);
        return body;
    }

    function buildHideTab() {
        const body = el('div', 'zd-customizer-tabbody');
        body.appendChild(tabHint('Hide elements you never use. Functional controls are never offered.'));
        HIDE_OPTIONS.forEach(([key, label]) => {
            body.appendChild(checkbox(
                !!working.hidden[key], label,
                (v) => { working.hidden[key] = v; persistAndApply(); }
            ));
        });
        return body;
    }

    function tabHint(text) { return el('p', 'zd-customizer-hint', text); }

    const TABS = [
        ['layout', 'Layout', buildLayoutTab],
        ['theme', 'Theme', buildThemeTab],
        ['text', 'Text & Density', buildTextTab],
        ['hide', 'Hide & Show', buildHideTab]
    ];

    function renderTab() {
        const bodyHost = panelEl && panelEl.querySelector('.zd-customizer-body');
        const tabsHost = panelEl && panelEl.querySelector('.zd-customizer-tabs');
        if (!bodyHost || !tabsHost) {
            logError(new Error('Customizer panel DOM missing'),
                { category: 'UI', context: 'customizer-render' });
            return;
        }
        bodyHost.innerHTML = '';
        tabsHost.querySelectorAll('.zd-customizer-tab').forEach((t) => {
            t.classList.toggle('zd-customizer-tab-active', t.dataset.tab === activeTab);
        });
        const def = TABS.find((t) => t[0] === activeTab);
        if (def) bodyHost.appendChild(def[2]());
    }

    function buildPanel() {
        const panel = el('div', 'zd-customizer-panel');

        const header = el('div', 'zd-customizer-header');
        header.appendChild(el('span', 'zd-customizer-title', 'Customize Zendesk'));
        const close = el('button', 'zd-customizer-close', '×');
        close.title = 'Close';
        close.addEventListener('click', closePanel);
        header.appendChild(close);
        panel.appendChild(header);

        const tabs = el('div', 'zd-customizer-tabs');
        TABS.forEach(([id, label]) => {
            const t = el('button', 'zd-customizer-tab', label);
            t.dataset.tab = id;
            t.addEventListener('click', () => { activeTab = id; renderTab(); });
            tabs.appendChild(t);
        });
        panel.appendChild(tabs);

        panel.appendChild(el('div', 'zd-customizer-body'));

        const footer = el('div', 'zd-customizer-footer');
        const reset = el('button', 'zd-btn-secondary', 'Reset all');
        reset.addEventListener('click', resetAll);
        const done = el('button', 'zd-btn-primary', 'Done');
        done.addEventListener('click', closePanel);
        footer.appendChild(reset);
        footer.appendChild(done);
        panel.appendChild(footer);

        return panel;
    }

    async function resetAll() {
        working = defaults();
        await persistAndApply();
        renderTab();
        if (window.ZDNotifyUtils && window.ZDNotifyUtils.showToast) {
            window.ZDNotifyUtils.showToast('Customizations reset', 'info', 1500);
        }
    }

    async function open() {
        if (!window.ZDStorage || !window.ZDCustomizerApply) {
            logError(new Error('Customizer dependencies not loaded'),
                { category: 'UI', context: 'customizer-open-deps' });
            toast('Customize Zendesk is still loading — try again in a moment.', 'error', 3000);
            return;
        }
        try {
            cachedCfg = (await window.ZDStorage.getConfig()) || {};
            working = mergeDefaults(cachedCfg.customizer);
            // Keep captured theme colors fresh in case the theme changed
            // elsewhere (e.g. the Settings modal) since last open.
            if (working.theme.applyToZendesk) {
                working.theme.colors = captureThemeColors() || working.theme.colors;
            }

            if (!panelEl) {
                panelEl = buildPanel();
                document.body.appendChild(panelEl);
            }
            if (panelEl.style.display === 'block') { closePanel(); return; }

            activeTab = 'layout';
            panelEl.style.display = 'block';
            renderTab();

            // Close when clicking outside the panel (next tick to avoid the
            // opening click immediately closing it).
            setTimeout(() => {
                outsideHandler = (e) => {
                    if (panelEl && !panelEl.contains(e.target) &&
                        !e.target.closest('[data-feature-id="customize"]')) {
                        closePanel();
                    }
                };
                document.addEventListener('mousedown', outsideHandler, true);
            }, 0);
        } catch (e) {
            logError(e, { category: 'UI', context: 'customizer-open' });
            toast('Could not open Customize Zendesk.', 'error', 3000);
        }
    }

    function closePanel() {
        if (panelEl) panelEl.style.display = 'none';
        if (outsideHandler) {
            document.removeEventListener('mousedown', outsideHandler, true);
            outsideHandler = null;
        }
    }

    window.ZDCustomizer = { open, close: closePanel };
    console.log('[Support Toolkit] Customizer module loaded');
})();
