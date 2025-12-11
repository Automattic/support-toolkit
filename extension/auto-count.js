// Auto-count system: automatically increment counters on ticket resolution

(function () {
    'use strict';

    // State for debouncing and status tracking
    let lastIncrementByTicketId = {}; // Per-ticket debounce tracking
    let lastStatusByTicketId = {};
    const SAME_TICKET_DEBOUNCE_MS = 60000; // 60 seconds - prevents double-count on same ticket

    /**
     * Get ticket ID from current URL
     * @returns {string|null} Ticket ID or null
     */
    function getTicketIdFromURL() {
        const match = window.location.pathname.match(/\/agent\/tickets\/(\d+)/);
        return match ? match[1] : null;
    }

    /**
     * Get current status text from Zendesk UI
     * @returns {string} Status text
     */
    function getCurrentStatusText() {
        // Try various Zendesk selectors for status
        const selectors = [
            '[data-test-id="ticket-status-menu-button"]',
            '[data-garden-id="dropdowns.select"] [data-garden-id="dropdowns.value"]',
            '.StyledValue-sc-1vb3zxh-1'
        ];

        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) {
                return (el.innerText || el.textContent || '').trim();
            }
        }
        return '';
    }

    /**
     * Check if text indicates a resolution action
     * @param {string} txt - Button/menu text
     * @returns {boolean} True if resolution action
     */
    function isResolutionActionText(txt) {
        if (!txt) return false;
        const t = txt.toLowerCase().trim();
        return (
            t.includes('submit as pending') ||
            t.includes('submit as solved') ||
            t.includes('submit as closed') ||
            t.includes('submit as on-hold') ||
            t.includes('submit as on hold') ||
            t === 'pending' ||
            t === 'solved' ||
            t === 'closed' ||
            t === 'set to pending' ||
            t === 'set to solved'
        );
    }

    /**
     * Cleanup old entries from debounce tracking (older than 5 minutes)
     */
    function cleanupOldDebounceEntries() {
        const now = Date.now();
        const CLEANUP_THRESHOLD = 5 * 60 * 1000; // 5 minutes

        for (const ticketId in lastIncrementByTicketId) {
            if (now - lastIncrementByTicketId[ticketId] > CLEANUP_THRESHOLD) {
                delete lastIncrementByTicketId[ticketId];
            }
        }
    }

    /**
     * Increment counter for resolution
     */
    async function incrementForResolution() {
        const ticketId = getTicketIdFromURL() || 'unknown';
        const now = Date.now();

        // Per-ticket debounce: skip if same ticket was counted within 60 seconds
        const lastForTicket = lastIncrementByTicketId[ticketId] || 0;
        if (now - lastForTicket < SAME_TICKET_DEBOUNCE_MS) {
            console.log(`[ZDAutoCount] Skipping duplicate for ticket ${ticketId} (within 60s window)`);
            return;
        }

        // Update timestamp for this ticket
        lastIncrementByTicketId[ticketId] = now;

        // Cleanup old entries to prevent memory bloat
        cleanupOldDebounceEntries();

        // Get current mode from state or default to tickets
        const currentMode = window.ZDState
            ? window.ZDState.get('currentMode')
            : 'tickets';
        const which = currentMode === 'chats' ? 'chats' : 'tickets';
        const currentUrl = window.location.href;

        // Increment counter (now includes URL for clickable activity)
        await window.ZDStorage.incCount(which, 1, {
            source: 'auto-resolution',
            ticketId: ticketId,
            url: currentUrl
        });

        // Trigger toolbar refresh
        if (window.ZDEvents) {
            window.ZDEvents.emit(window.ZDEvents.EVENTS.TOOLBAR_REFRESH);
        }

        // Handle worked log: show popup or auto-create entry
        const cfg = await window.ZDStorage.getConfig();

        if (cfg.enableSummaryPopup) {
            // Emit event to show summary popup in content.js
            if (window.ZDEvents) {
                window.ZDEvents.emit(window.ZDEvents.EVENTS.WORKEDLOG_SHOW_POPUP, {
                    mode: which,
                    ticketId: ticketId,
                    url: currentUrl,
                    source: 'auto-resolution'
                });
            }
        } else {
            // Auto-create worked log entry without summary
            await window.ZDStorage.appendWorkedLog({
                timestamp: new Date().toISOString(),
                mode: which,
                ticketId: ticketId,
                url: currentUrl,
                summary: '',
                source: 'auto-resolution'
            });
        }
    }

    /**
     * Initialize auto-count listeners
     */
    function init() {
        // Store the old status right BEFORE submit click
        document.body.addEventListener('mousedown', (e) => {
            const candidate = e.target.closest(
                '[data-test-id="omni-save-button"], ' +
                '[data-test-id="submit_button-button"], ' +
                '[role="menuitem"], ' +
                '[data-test-id="ticket-footer-post-save-actions-menu-button"]'
            );
            if (!candidate) return;

            const tid = getTicketIdFromURL() || 'noid';
            lastStatusByTicketId[tid] = getCurrentStatusText();
        });

        // On click: immediate check + fallback check
        document.body.addEventListener('click', (e) => {
            const candidate = e.target.closest(
                '[data-test-id="omni-save-button"], ' +
                '[data-test-id="submit_button-button"], ' +
                '[role="menuitem"], ' +
                '[data-test-id="ticket-footer-post-save-actions-menu-button"]'
            );
            if (!candidate) return;

            const clickedText = (candidate.innerText || candidate.textContent || '').trim();

            // Case 1: Button text literally says "Submit as Pending", etc.
            if (isResolutionActionText(clickedText)) {
                incrementForResolution();
                return;
            }

            // Case 2: Fallback (wait for Zendesk to apply new status)
            setTimeout(() => {
                const tid = getTicketIdFromURL() || 'noid';
                const oldStatus = (lastStatusByTicketId[tid] || '').toLowerCase().trim();
                const newStatus = getCurrentStatusText().toLowerCase().trim();
                if (!newStatus) return;

                const resolvedNow =
                    (newStatus.includes('pending') ||
                     newStatus.includes('solved') ||
                     newStatus.includes('closed')) &&
                    newStatus !== oldStatus;

                if (resolvedNow) {
                    incrementForResolution();
                }
            }, 300);
        });
    }

    // Public API
    window.ZDAutoCount = {
        init,
        getTicketIdFromURL,
        getCurrentStatusText,
        isResolutionActionText,
        incrementForResolution
    };
})();
