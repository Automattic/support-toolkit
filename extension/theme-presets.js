// Advanced Theme Presets Module - Light/Dark variants for each theme
// Provides theme options with automatic light/dark mode support

(function () {
    'use strict';

    const { logError } = window.ZDErrorHandler || { logError: console.error };
    const { showToast } = window.ZDNotificationUtils || {};

    // Theme definitions with light and dark variants
    const THEME_PRESETS = {
        default: {
            name: 'Default',
            description: 'Clean modern',
            light: {
                primary: '#5a6d9e',
                secondary: '#6b5b87',
                background: 'rgba(255, 255, 255, 0.98)',
                text: '#3a4454',
                textSecondary: '#6b7280',
                border: 'rgba(0, 0, 0, 0.12)',
                modalBg: '#fafafa',
                sectionBg: 'rgba(245, 247, 250, 0.7)',
                inputBg: '#f9f9f9',
                buttonSecondaryBg: '#e8ebef'
            },
            dark: {
                primary: '#4f5e87',
                secondary: '#5d4f6f',
                background: 'rgba(28, 32, 40, 0.98)',
                text: '#d1d5db',
                textSecondary: '#9ca3af',
                border: 'rgba(255, 255, 255, 0.08)',
                modalBg: '#1f2329',
                sectionBg: 'rgba(35, 40, 48, 0.5)',
                inputBg: '#2a2f37',
                buttonSecondaryBg: '#2a2f37'
            },
            font: 'system-ui, -apple-system, sans-serif',
            borderRadius: '12px',
            effects: { pixelated: false, scanlines: false }
        },

        ocean: {
            name: 'Ocean',
            description: 'Deep blue',
            light: {
                primary: '#3d7a8a',
                secondary: '#4a8c9e',
                background: 'rgba(248, 251, 253, 0.98)',
                text: '#2c4a5a',
                textSecondary: '#4a6775',
                border: 'rgba(60, 120, 140, 0.15)',
                modalBg: '#f8fbfd',
                sectionBg: 'rgba(236, 244, 248, 0.7)',
                inputBg: '#f5f9fb',
                buttonSecondaryBg: '#e8f1f5'
            },
            dark: {
                primary: '#4a7585',
                secondary: '#537d8d',
                background: 'rgba(22, 35, 42, 0.98)',
                text: '#c5d9e0',
                textSecondary: '#8fa9b5',
                border: 'rgba(80, 120, 140, 0.2)',
                modalBg: '#1a2830',
                sectionBg: 'rgba(30, 45, 55, 0.5)',
                inputBg: '#243038',
                buttonSecondaryBg: '#243038'
            },
            font: 'system-ui, -apple-system, sans-serif',
            borderRadius: '16px',
            effects: { pixelated: false, scanlines: false }
        },

        forest: {
            name: 'Forest',
            description: 'Natural green',
            light: {
                primary: '#4a7c5f',
                secondary: '#5a8c6f',
                background: 'rgba(248, 252, 249, 0.98)',
                text: '#2d4a3a',
                textSecondary: '#4a6554',
                border: 'rgba(75, 125, 100, 0.15)',
                modalBg: '#f8fcf9',
                sectionBg: 'rgba(238, 246, 241, 0.7)',
                inputBg: '#f5faf7',
                buttonSecondaryBg: '#e8f2ec'
            },
            dark: {
                primary: '#4f7563',
                secondary: '#5d8371',
                background: 'rgba(22, 35, 28, 0.98)',
                text: '#c8dcd2',
                textSecondary: '#8fa99a',
                border: 'rgba(80, 120, 100, 0.2)',
                modalBg: '#1a2822',
                sectionBg: 'rgba(28, 42, 35, 0.5)',
                inputBg: '#233029',
                buttonSecondaryBg: '#233029'
            },
            font: 'system-ui, -apple-system, sans-serif',
            borderRadius: '12px',
            effects: { pixelated: false, scanlines: false }
        },

        neon: {
            name: 'Neon',
            description: 'Cyberpunk',
            light: {
                primary: '#8866a0',
                secondary: '#7a5f94',
                background: 'rgba(250, 248, 252, 0.98)',
                text: '#3e2d52',
                textSecondary: '#5a4569',
                border: 'rgba(135, 100, 160, 0.15)',
                modalBg: '#faf8fc',
                sectionBg: 'rgba(242, 237, 247, 0.7)',
                inputBg: '#f7f5f9',
                buttonSecondaryBg: '#ede8f2'
            },
            dark: {
                primary: '#7d6890',
                secondary: '#6f5a82',
                background: 'rgba(25, 22, 30, 0.98)',
                text: '#d1c8db',
                textSecondary: '#9e91ad',
                border: 'rgba(125, 105, 145, 0.2)',
                modalBg: '#1c1a22',
                sectionBg: 'rgba(32, 28, 38, 0.5)',
                inputBg: '#272330',
                buttonSecondaryBg: '#272330'
            },
            font: 'system-ui, -apple-system, sans-serif',
            borderRadius: '8px',
            effects: { pixelated: false, scanlines: false }
        }
    };

    // Size presets
    const SIZE_PRESETS = {
        compact: { name: 'Compact', toolbarScale: 0.85, fontSize: 13, padding: 6, iconSize: 14 },
        normal: { name: 'Normal', toolbarScale: 1.0, fontSize: 14, padding: 8, iconSize: 16 },
        large: { name: 'Large', toolbarScale: 1.15, fontSize: 16, padding: 10, iconSize: 18 },
        xlarge: { name: 'Extra Large', toolbarScale: 1.3, fontSize: 18, padding: 12, iconSize: 20 }
    };

    /**
     * Apply theme to DOM
     */
    async function applyTheme(themeId, isDark, sizeId = 'normal') {
        try {
            const themePreset = THEME_PRESETS[themeId];
            const size = SIZE_PRESETS[sizeId];

            if (!themePreset) throw new Error(`Theme not found: ${themeId}`);
            if (!size) throw new Error(`Size not found: ${sizeId}`);

            // Get the right color scheme (light or dark)
            const colors = isDark ? themePreset.dark : themePreset.light;

            // Remove existing theme classes
            document.body.classList.remove('zd-theme-pixel', 'zd-theme-dark', 'zd-theme-scanlines');

            // Add theme classes
            if (isDark) document.body.classList.add('zd-theme-dark');
            if (themePreset.effects.pixelated) document.body.classList.add('zd-theme-pixel');
            if (themePreset.effects.scanlines && isDark) document.body.classList.add('zd-theme-scanlines');

            // Apply CSS custom properties
            const root = document.documentElement;
            root.style.setProperty('--zd-primary', colors.primary);
            root.style.setProperty('--zd-secondary', colors.secondary);
            root.style.setProperty('--zd-background', colors.background);
            root.style.setProperty('--zd-text', colors.text);
            root.style.setProperty('--zd-text-secondary', colors.textSecondary);
            root.style.setProperty('--zd-border', colors.border);
            root.style.setProperty('--zd-modal-bg', colors.modalBg);
            root.style.setProperty('--zd-section-bg', colors.sectionBg);
            root.style.setProperty('--zd-input-bg', colors.inputBg);
            root.style.setProperty('--zd-button-secondary-bg', colors.buttonSecondaryBg);
            root.style.setProperty('--zd-font', themePreset.font);
            root.style.setProperty('--zd-border-radius', themePreset.borderRadius);

            // Apply size settings
            root.style.setProperty('--zd-scale', size.toolbarScale);
            root.style.setProperty('--zd-font-size', size.fontSize + 'px');
            root.style.setProperty('--zd-padding', size.padding + 'px');
            root.style.setProperty('--zd-icon-size', size.iconSize + 'px');

            // Save to storage
            await window.ZDStorage?.setConfig({
                currentTheme: themeId,
                currentSize: sizeId,
                theme: isDark ? 'dark' : 'light' // Keep old property for compatibility
            });

            console.log('[Theme Presets] Applied:', themeId, isDark ? 'dark' : 'light', sizeId);
        } catch (error) {
            logError(error, { category: 'UI', context: 'apply-theme' });
            throw error;
        }
    }

    /**
     * Get current theme settings
     */
    async function getCurrentTheme() {
        const config = await window.ZDStorage?.getConfig() || {};
        return {
            theme: config.currentTheme || 'default',
            isDark: config.theme === 'dark',
            size: config.currentSize || 'normal'
        };
    }

    /**
     * Toggle dark mode for current theme
     */
    async function toggleDarkMode() {
        const current = await getCurrentTheme();
        const newDark = !current.isDark;
        await applyTheme(current.theme, newDark, current.size);

        if (showToast) {
            showToast(newDark ? 'Dark mode on' : 'Light mode on', 'info', 1500);
        }
    }

    /**
     * Get all theme presets
     */
    function getThemePresets() {
        return { ...THEME_PRESETS };
    }

    /**
     * Get all size presets
     */
    function getSizePresets() {
        return { ...SIZE_PRESETS };
    }

    /**
     * Create theme preview element
     */
    function createThemePreview(themeId, isDark) {
        const themePreset = THEME_PRESETS[themeId];
        if (!themePreset) return null;

        const colors = isDark ? themePreset.dark : themePreset.light;

        const preview = document.createElement('div');
        preview.className = 'zd-theme-preview';
        preview.innerHTML = `
            <div class="zd-theme-preview-colors" style="
                background: linear-gradient(135deg, ${colors.primary}, ${colors.secondary});
                border: 2px solid ${colors.border};
                border-radius: ${themePreset.borderRadius};
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            ">
                <div class="zd-theme-preview-swatch" style="background: ${colors.background};"></div>
                <div class="zd-theme-preview-swatch" style="background: ${colors.primary};"></div>
                <div class="zd-theme-preview-swatch" style="background: ${colors.secondary};"></div>
            </div>
            <div class="zd-theme-preview-name">${themePreset.name}</div>
        `;

        return preview;
    }

    // Expose public API
    window.ZDThemePresets = {
        applyTheme,
        getCurrentTheme,
        toggleDarkMode,
        getThemePresets,
        getSizePresets,
        createThemePreview,
        THEME_PRESETS,
        SIZE_PRESETS
    };

    console.log('[Support Toolkit] Theme Presets module loaded');
})();
