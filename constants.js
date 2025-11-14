// Configuration constants and defaults

(function () {

    // Chrome storage keys
    const STORAGE_KEYS = {
        CONFIG: 'ZDCounter-config',
        LOGS: 'ZDCounter-logs',
        CHAT_COUNT: 'ZDCounter-chats',
        TICKET_COUNT: 'ZDCounter-tickets',
        THEME: 'ZDCounter-theme',
        POSITION: 'ZDCounter-bar-position',
        VERSION: 'ZDCounter-version',
        ACTIVITY_LOG: 'ZDCounter-activity-log'
    };

    // Default user configuration
    const DEFAULT_CONFIG = {
        version: '1.0.0',

        // Schedule settings
        calendarURL: '',
        onboardedCalendar: false,
        weekStartsOn: 'Mon',

        // Performance goals
        goalChatsPerHour: 10,
        goalTicketsPerHour: 12,

        // UI preferences
        showPercentages: true,
        showYesterday: true,
        showShiftReminders: true,
        playReminderSound: true,
        showShiftTimer: true,
        detectFirstTimer: false,
        gapPreChatAlert: false,
        enableDeduplication: true,

        // Toolbar customization
        showTranslator: true,
        showAICopilot: true,
        showNotes: true,
        showStats: true,
        toolbarCompactMode: false,

        // Alert timing
        preShiftWarningMinutes: 5,

        // Data backup
        backup: null,

        // Developer and theme
        devMode: false,
        theme: 'light',

        // AI Copilot (optional)
        aiApiKey: ''
    };

    // UI color palette
    const COLORS = {
        barLight: '#ffffff',
        barDark: '#1e1e1e',
        accentBlue: '#0073aa',
        accentRed: '#d63638',
        accentGreen: '#00a32a',
        accentGray: '#888888'
    };

    // Update intervals (milliseconds)
    const REFRESH_INTERVALS = {
        TIMER: 1000,
        COUNTS: 5000
    };

    // CSS class names
    const CLASSNAMES = {
        toolbar: 'zd-toolbar',
        counter: 'zd-counter',
        modal: 'zd-modal',
        darkTheme: 'theme-dark'
    };

    // Zendesk DOM selectors for auto-detection
    const ZENDESK_SELECTORS = {
        ticketSubmitButton:
            '[data-test-id="omni-save-button"], [data-test-id="submit_button-button"]',
        chatSubmitButton:
            '[data-test-id="submit_button-button"]',
        ticketStatusDropdown:
            '[data-test-id="ticket-status-dropdown"], [data-test-id="status_select"]'
    };

    window.ZDConstants = {
        STORAGE_KEYS,
        DEFAULT_CONFIG,
        COLORS,
        REFRESH_INTERVALS,
        CLASSNAMES,
        ZENDESK_SELECTORS
    };
})();
