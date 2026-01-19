// LibreChat Panel - Embedded AI chat within Zendesk
// Embeds chat.a8c.com (Automattic's LibreChat instance) in a side panel

(function () {
    'use strict';

    const LIBRECHAT_URL = 'https://chat.a8c.com/';

    let librechatPanelEl = null;
    let isLibrechatPanelVisible = false;

    /**
     * Create LibreChat panel UI
     */
    function createLibrechatPanel() {
        if (librechatPanelEl) return librechatPanelEl;

        const panel = document.createElement('div');
        panel.className = 'zd-librechat-panel';
        panel.style.display = 'none';

        panel.innerHTML = `
            <div class="zd-librechat-panel-header">
                <div class="zd-librechat-panel-title">
                    ${window.ZDIcons ? window.ZDIcons.getIconHTML('ai', 20) : '🧠'}
                    <span>LibreChat</span>
                </div>
                <button class="zd-librechat-close-btn" title="Close panel">×</button>
            </div>

            <div class="zd-librechat-toolbar">
                <button class="zd-librechat-newtab-btn" title="Open in new tab (persistent session)">
                    Open in New Tab ↗
                </button>
            </div>

            <div class="zd-librechat-iframe-container">
                <iframe
                    id="zd-librechat-iframe"
                    src="${LIBRECHAT_URL}"
                    class="zd-librechat-iframe"
                    allow="clipboard-write; storage-access"
                ></iframe>
                <div class="zd-librechat-iframe-overlay" style="display: none;">
                    <div class="zd-librechat-auth-message">
                        <p>Session expired? Open in a new tab for persistent login.</p>
                        <button class="zd-librechat-auth-btn">Open in New Tab ↗</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(panel);
        librechatPanelEl = panel;

        // Event listeners
        panel.querySelector('.zd-librechat-close-btn').addEventListener('click', hideLibrechatPanel);

        panel.querySelector('.zd-librechat-newtab-btn').addEventListener('click', () => {
            window.open(LIBRECHAT_URL, '_blank');
        });

        panel.querySelector('.zd-librechat-auth-btn').addEventListener('click', () => {
            window.open(LIBRECHAT_URL, '_blank');
        });

        return panel;
    }

    /**
     * Show LibreChat panel
     */
    function showLibrechatPanel() {
        if (!librechatPanelEl) {
            createLibrechatPanel();
        }

        // Hide Linear panel if visible
        if (window.ZDLinearPanel && window.ZDLinearPanel.isLinearPanelOpen && window.ZDLinearPanel.isLinearPanelOpen()) {
            window.ZDLinearPanel.closeLinearPanel();
        }

        librechatPanelEl.style.display = 'flex';
        isLibrechatPanelVisible = true;

        // Emit event
        if (window.ZDEvents) {
            window.ZDEvents.emit('librechat-panel-opened');
        }
    }

    /**
     * Hide LibreChat panel
     */
    function hideLibrechatPanel() {
        if (librechatPanelEl) {
            librechatPanelEl.style.display = 'none';
        }
        isLibrechatPanelVisible = false;

        // Emit event
        if (window.ZDEvents) {
            window.ZDEvents.emit('librechat-panel-closed');
        }
    }

    /**
     * Toggle LibreChat panel visibility
     */
    function toggleLibrechatPanel() {
        if (isLibrechatPanelVisible) {
            hideLibrechatPanel();
        } else {
            showLibrechatPanel();
        }
    }

    /**
     * Check if panel is currently visible
     */
    function isVisible() {
        return isLibrechatPanelVisible;
    }

    /**
     * Refresh the iframe
     */
    function refreshIframe() {
        if (!librechatPanelEl) return;
        const iframe = librechatPanelEl.querySelector('#zd-librechat-iframe');
        if (iframe) {
            iframe.src = LIBRECHAT_URL;
        }
    }

    // Export to global scope
    window.ZDLibrechatPanel = {
        create: createLibrechatPanel,
        show: showLibrechatPanel,
        hide: hideLibrechatPanel,
        toggle: toggleLibrechatPanel,
        isVisible,
        refresh: refreshIframe
    };

})();
