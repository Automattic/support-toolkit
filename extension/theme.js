// Theme management and toolbar positioning

(function () {
    'use strict';

    /**
     * Apply theme to DOM (add/remove dark class)
     */
    async function applyThemeToDOM() {
        try {
            const cfg = await window.ZDStorage.getConfig();
            const theme = cfg.theme || 'light';
            if (theme === 'dark') {
                document.body.classList.add('zd-theme-dark');
            } else {
                document.body.classList.remove('zd-theme-dark');
            }

            // Emit event
            if (window.ZDEvents) {
                window.ZDEvents.emit(window.ZDEvents.EVENTS.THEME_CHANGED, { theme });
            }
        } catch (err) {
            console.warn('[Theme] Failed to apply theme:', err);
        }
    }

    /**
     * Enable toolbar dragging with position persistence
     * @param {HTMLElement} bar - Toolbar element
     * @param {HTMLElement} handle - Drag handle element
     */
    function enableDragging(bar, handle) {
        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        // Define handlers so they can be removed
        const onMouseMove = (e) => {
            if (!dragging) return;
            bar.style.left = `${e.clientX - offsetX}px`;
            bar.style.top = `${e.clientY - offsetY}px`;
        };

        const onMouseUp = async () => {
            if (!dragging) return;
            dragging = false;

            // Remove listeners when drag ends
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            // Get dropped position
            const rawPos = {
                top: parseInt(bar.style.top, 10),
                left: parseInt(bar.style.left, 10)
            };

            // Update state
            if (window.ZDState) {
                window.ZDState.set('preferredBarPos', rawPos);
            }

            // Clamp to viewport
            const clamped = clampToViewport(rawPos, bar);
            bar.style.top = clamped.top + 'px';
            bar.style.left = clamped.left + 'px';

            // Save position
            await window.ZDStorage.setBarPosition(rawPos);
        };

        handle.addEventListener('mousedown', (e) => {
            dragging = true;
            const rect = bar.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            e.preventDefault();

            // Only attach listeners during drag
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    /**
     * Clamp position to keep toolbar visible in viewport
     * @param {Object} pos - {top, left}
     * @param {HTMLElement} [toolbar] - Toolbar element (optional, uses state if not provided)
     * @returns {Object} Clamped {top, left}
     */
    function clampToViewport(pos, toolbar) {
        const toolbarEl = toolbar || (window.ZDState ? window.ZDState.get('toolbarEl') : null);
        if (!toolbarEl) return pos;

        const barRect = toolbarEl.getBoundingClientRect();
        const barW = barRect.width || 200;
        const barH = barRect.height || 40;

        const maxLeft = window.innerWidth - barW - 8;
        const maxTop = window.innerHeight - barH - 8;

        let newLeft = Math.max(8, Math.min(pos.left, maxLeft));
        let newTop = Math.max(8, Math.min(pos.top, maxTop));

        return { top: newTop, left: newLeft };
    }

    /**
     * Apply saved toolbar position
     * @param {boolean} [initialLoad=false] - Whether this is initial load
     */
    async function applySavedPosition(initialLoad = false) {
        const toolbarEl = window.ZDState ? window.ZDState.get('toolbarEl') : null;
        if (!toolbarEl) return;

        try {
            const savedPos = await window.ZDStorage.getBarPosition();

            if (savedPos && typeof savedPos.top === 'number' && typeof savedPos.left === 'number') {
                // Update state
                if (window.ZDState) {
                    window.ZDState.set('preferredBarPos', savedPos);
                }

                // Clamp and apply
                const clamped = clampToViewport(savedPos, toolbarEl);
                toolbarEl.style.top = clamped.top + 'px';
                toolbarEl.style.left = clamped.left + 'px';
            } else if (initialLoad) {
                // Default position: top-right
                const defaultPos = { top: 20, left: window.innerWidth - 320 };
                if (window.ZDState) {
                    window.ZDState.set('preferredBarPos', defaultPos);
                }
                toolbarEl.style.top = defaultPos.top + 'px';
                toolbarEl.style.left = defaultPos.left + 'px';
            }
        } catch (err) {
            console.warn('[Theme] Failed to apply saved position:', err);
        }
    }

    /**
     * Handle window resize - reclamp toolbar position
     */
    function handleResize() {
        const toolbarEl = window.ZDState ? window.ZDState.get('toolbarEl') : null;
        const preferredBarPos = window.ZDState ? window.ZDState.get('preferredBarPos') : null;

        if (!toolbarEl || !preferredBarPos) return;

        const clamped = clampToViewport(preferredBarPos, toolbarEl);
        toolbarEl.style.top = clamped.top + 'px';
        toolbarEl.style.left = clamped.left + 'px';
    }

    /**
     * Initialize theme module
     */
    function init() {
        // Listen for window resize
        window.addEventListener('resize', handleResize);
    }

    /**
     * Cleanup
     */
    function cleanup() {
        window.removeEventListener('resize', handleResize);
    }

    // Public API
    window.ZDTheme = {
        applyThemeToDOM,
        enableDragging,
        clampToViewport,
        applySavedPosition,
        handleResize,
        init,
        cleanup
    };
})();
