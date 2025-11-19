// Event bus for decoupled module communication

(function () {
    'use strict';

    const listeners = {};

    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     * @returns {Function} Unsubscribe function
     */
    function on(event, callback) {
        if (!listeners[event]) {
            listeners[event] = [];
        }
        listeners[event].push(callback);

        // Return unsubscribe function
        return function off() {
            const idx = listeners[event].indexOf(callback);
            if (idx > -1) {
                listeners[event].splice(idx, 1);
            }
        };
    }

    /**
     * Subscribe to an event (one-time)
     * @param {string} event - Event name
     * @param {Function} callback - Handler function
     */
    function once(event, callback) {
        const off = on(event, (...args) => {
            off();
            callback(...args);
        });
    }

    /**
     * Emit an event to all subscribers
     * @param {string} event - Event name
     * @param {*} data - Event data
     */
    function emit(event, data) {
        if (!listeners[event]) return;

        for (const callback of listeners[event]) {
            try {
                callback(data);
            } catch (err) {
                console.error(`[ZDEvents] Error in ${event} handler:`, err);
            }
        }
    }

    /**
     * Remove all listeners for an event (or all events)
     * @param {string} [event] - Event name (optional)
     */
    function clear(event) {
        if (event) {
            delete listeners[event];
        } else {
            for (const key in listeners) {
                delete listeners[key];
            }
        }
    }

    // Event name constants for consistency
    const EVENTS = {
        // Toolbar events
        TOOLBAR_CREATED: 'toolbar:created',
        TOOLBAR_REFRESH: 'toolbar:refresh',
        MODE_CHANGED: 'mode:changed',
        COUNT_UPDATED: 'count:updated',

        // Schedule events
        SCHEDULE_UPDATED: 'schedule:updated',
        SCHEDULE_CACHE_REFRESHED: 'schedule:cacheRefreshed',

        // Timer events
        TIMER_TICK: 'timer:tick',
        SHIFT_STARTED: 'shift:started',
        SHIFT_ENDED: 'shift:ended',

        // Modal events
        SETTINGS_OPENED: 'settings:opened',
        SETTINGS_CLOSED: 'settings:closed',
        SETTINGS_SAVED: 'settings:saved',
        STATS_OPENED: 'stats:opened',
        STATS_CLOSED: 'stats:closed',

        // Theme events
        THEME_CHANGED: 'theme:changed',

        // Storage events
        STORAGE_READY: 'storage:ready',
        DAILY_RESET: 'daily:reset',

        // Notes events
        NOTES_SAVED: 'notes:saved',

        // AI events
        AI_MESSAGE_SENT: 'ai:messageSent',
        AI_RESPONSE_RECEIVED: 'ai:responseReceived'
    };

    // Public API
    window.ZDEvents = {
        on,
        once,
        emit,
        clear,
        EVENTS
    };
})();
