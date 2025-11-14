// Application configuration and feature flags

(function () {

    // Performance tuning constants
    const PERFORMANCE = {
        DEBOUNCE_DELAY: 300,
        THROTTLE_INTERVAL: 1000,
        CACHE_TTL: 60000, // 1 minute
        STORAGE_RETRY_ATTEMPTS: 3,
        NETWORK_TIMEOUT: 10000, // 10 seconds
        MAX_CALENDAR_EVENTS: 100
    };

    // UI timing constants
    const UI_TIMING = {
        TOAST_DURATION: 5000,
        MODAL_ANIMATION: 200,
        LOADING_MIN_DISPLAY: 500,
        AUTO_SAVE_DELAY: 1000,
        GRACE_PERIOD_MS: 15000
    };

    // Data validation limits
    const LIMITS = {
        MAX_COUNT_VALUE: 999,
        MIN_COUNT_VALUE: 0,
        MAX_GOAL_VALUE: 100,
        MIN_GOAL_VALUE: 1,
        MAX_HOURS: 24,
        MIN_WARNING_MINUTES: 1,
        MAX_WARNING_MINUTES: 60,
        MAX_URL_LENGTH: 2000,
        MAX_ERROR_LOG_SIZE: 100
    };

    // Feature flags for gradual rollout
    const FEATURES = {
        ENABLE_AUTO_INCREMENT: true,
        ENABLE_SHIFT_REMINDERS: true,
        ENABLE_ANALYTICS: false,
        ENABLE_OFFLINE_MODE: false,
        ENABLE_SYNC_CONFLICT_RESOLUTION: true,
        ENABLE_ADVANCED_STATS: true
    };

    // Calendar configuration
    const CALENDAR = {
        REFRESH_INTERVAL: 300000, // 5 minutes
        STALE_THRESHOLD: 600000, // 10 minutes
        RETRY_ATTEMPTS: 3,
        TIMEOUT: 8000
    };

    // Zendesk selectors (centralized for easy updates)
    const SELECTORS = {
        SUBMIT_BUTTONS: [
            '[data-test-id="omni-save-button"]',
            '[data-test-id="submit_button-button"]'
        ],
        STATUS_DROPDOWNS: [
            '[data-test-id="ticket-status-dropdown"]',
            '[data-test-id="status-dropdown-trigger"]',
            '[data-test-id="status_select"]',
            '[data-test-id="status-dropdown"]'
        ],
        MENU_ITEMS: '[role="menuitem"]',
        POST_ACTIONS: '[data-test-id="ticket-footer-post-save-actions-menu-button"]'
    };

    // Status keywords for auto-increment detection
    const STATUS_KEYWORDS = {
        RESOLUTION: [
            'submit as pending',
            'submit as solved',
            'submit as closed',
            'submit as on-hold',
            'submit as on hold',
            'set to pending',
            'set to solved'
        ],
        STANDALONE: [
            'pending',
            'solved',
            'closed'
        ]
    };

    // GIF URLs for notifications
    const NOTIFICATION_GIFS = {
        CHAT_START: 'https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExZDZ4ZjhybjQ0MTFqMzNkc3htdzExa2xyNzRyN3NpMm5tczczdTE2diZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/HBMCmtsPEUShG/giphy.gif',
        CHAT_END: 'https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExNDc0cHpzN25rZmJxN2RhMTd6cmR0c3h3MXR6Y3JjcDUxaHk2dmYwayZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/4ZtzlT61uOzFtN7hBG/giphy.gif',
        TICKETS_START: 'https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExZzBzdDJtZGFtdjFhdXlvYzZxcnZrMzJ0c2lsenEyY3l2OW9rYWlhZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/SbblchRKdkG7YR6U8L/giphy.gif',
        TICKETS_END: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZzU2bDhsZ2RpZW11YXZzY3ZhOWx2YWdyeDIzc2RvaGdvdzR5N3hiayZlcD12MV9naWZzX3NlYXJjaCZjdD1n/D28t0Rto3daKI/giphy.gif'
    };

    // Validation schemas
    const SCHEMAS = {
        // Validate config object structure
        isValidConfig: (obj) => {
            return obj &&
                typeof obj === 'object' &&
                (obj.version === undefined || typeof obj.version === 'string') &&
                (obj.calendarURL === undefined || typeof obj.calendarURL === 'string') &&
                (obj.goalChatsPerHour === undefined || typeof obj.goalChatsPerHour === 'number') &&
                (obj.goalTicketsPerHour === undefined || typeof obj.goalTicketsPerHour === 'number');
        },

        // Validate counts object
        isValidCounts: (obj) => {
            return obj &&
                typeof obj === 'object' &&
                typeof obj.chats === 'number' &&
                typeof obj.tickets === 'number' &&
                obj.chats >= 0 &&
                obj.tickets >= 0;
        },

        // Validate calendar URL
        isValidCalendarURL: (url) => {
            if (!url || typeof url !== 'string') return false;
            try {
                const parsed = new URL(url);
                return parsed.protocol === 'https:' &&
                       (parsed.hostname.includes('happy.tools') ||
                        parsed.hostname.includes('calendar.google.com'));
            } catch {
                return false;
            }
        }
    };

    // Public API
    window.ZDConfig = {
        PERFORMANCE,
        UI_TIMING,
        LIMITS,
        FEATURES,
        CALENDAR,
        SELECTORS,
        STATUS_KEYWORDS,
        NOTIFICATION_GIFS,
        SCHEMAS
    };
})();
