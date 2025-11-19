// Centralized state management for shared variables across modules

(function () {
    'use strict';

    // Private state container
    const state = {
        // Current mode (chats/tickets)
        currentMode: 'chats',

        // DOM element references
        toolbarEl: null,
        countEl: null,
        ticketsPctEl: null,
        chatsPctEl: null,
        avgHrEl: null,
        timerEl: null,

        // Modal overlays
        settingsOverlayEl: null,
        scheduleOverlayEl: null,
        statsOverlayEl: null,

        // Toolbar position
        preferredBarPos: { top: 20, left: window.innerWidth - 320 },

        // Schedule cache
        cachedEventsToday: [],
        cachedScheduleDayKey: null,
        cachedScheduleFetchedAt: 0,
        cachedChatHours: 0,
        cachedTicketHours: 0,
        cachedTotalHours: 0,

        // Timer state
        timerLiveReady: false,
        latestTimerMode: 'none',
        lastManualSwitchAt: 0,

        // Auto-count state
        lastIncrementTime: 0,
        lastStatusByTicketId: {},

        // UI state
        confettiTriggered: false,
        calendarPromptShownThisSession: false,

        // AI chat history
        aiChatHistory: []
    };

    /**
     * Get a state value
     * @param {string} key - State key
     * @returns {*} State value
     */
    function get(key) {
        if (!(key in state)) {
            console.warn(`[ZDState] Unknown state key: ${key}`);
            return undefined;
        }
        return state[key];
    }

    /**
     * Set a state value
     * @param {string} key - State key
     * @param {*} value - New value
     * @param {boolean} [silent=false] - Skip event emission
     */
    function set(key, value, silent = false) {
        if (!(key in state)) {
            console.warn(`[ZDState] Unknown state key: ${key}`);
            return;
        }

        const oldValue = state[key];
        state[key] = value;

        // Emit change event if value changed and not silent
        if (!silent && oldValue !== value && window.ZDEvents) {
            window.ZDEvents.emit(`state:${key}`, { key, value, oldValue });
        }
    }

    /**
     * Update multiple state values at once
     * @param {Object} updates - Object with key-value pairs
     * @param {boolean} [silent=false] - Skip event emission
     */
    function update(updates, silent = false) {
        for (const key in updates) {
            set(key, updates[key], silent);
        }
    }

    /**
     * Get all state (for debugging)
     * @returns {Object} Copy of state
     */
    function getAll() {
        return { ...state };
    }

    /**
     * Reset state to defaults (useful for testing)
     */
    function reset() {
        state.currentMode = 'chats';
        state.toolbarEl = null;
        state.countEl = null;
        state.ticketsPctEl = null;
        state.chatsPctEl = null;
        state.avgHrEl = null;
        state.timerEl = null;
        state.settingsOverlayEl = null;
        state.scheduleOverlayEl = null;
        state.statsOverlayEl = null;
        state.preferredBarPos = { top: 20, left: window.innerWidth - 320 };
        state.cachedEventsToday = [];
        state.cachedScheduleDayKey = null;
        state.cachedScheduleFetchedAt = 0;
        state.cachedChatHours = 0;
        state.cachedTicketHours = 0;
        state.cachedTotalHours = 0;
        state.timerLiveReady = false;
        state.latestTimerMode = 'none';
        state.lastManualSwitchAt = 0;
        state.lastIncrementTime = 0;
        state.lastStatusByTicketId = {};
        state.confettiTriggered = false;
        state.calendarPromptShownThisSession = false;
        state.aiChatHistory = [];
    }

    // Public API
    window.ZDState = {
        get,
        set,
        update,
        getAll,
        reset
    };
})();
