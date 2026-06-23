// Zendesk DOM selectors — single source of truth.
//
// Zendesk Agent Workspace is React + the Garden design system. Hashed class
// names are unstable; `data-test-id` and `data-garden-id` are the durable
// hooks (verified live 2026-06-22). Centralizing them here means a Zendesk
// UI change is a one-file fix instead of a hunt across modules.
//
// Dependency-free and safe to load at document_start (used by the customizer
// applier before other modules exist). Only touches the DOM and location.

(function () {
    'use strict';

    const SELECTORS = {
        // --- Ticket layout (CSS Grid; ticket pages only) ---
        // Stable class on the grid container. The sibling data-test-id is
        // `ticket-<id>-custom-layout` (id varies) — prefer the class.
        ticketGrid: '.ticket-panes-grid-layout',
        panesAll: '[data-test-id^="column-"]',
        pane: (n) => `[data-test-id="column-${n}"]`,

        // Verified role → grid column mapping:
        //  column-1 = Apps pane (hosts a8cnotes), column-2 = Conversation,
        //  column-3 = Context panel (customer / User Info).
        roleColumn: { apps: 1, conversation: 2, context: 3 },

        // --- Persistent global chrome (present on EVERY agent page) ---
        body: 'body',
        header: 'header[data-test-id="header-toolbar"]',
        headerTabs: 'nav[data-test-id="header-tablist"]',
        mainContent: 'main[data-garden-id="navigation.main"]',

        // --- Ticket sub-elements (for theming / density / hide) ---
        // The conversation log container is `omni-log-container`; individual
        // messages are `omni-log-comment-item` with body `omni-log-item-message`.
        conversationLog: '[data-test-id="omni-log-container"]',
        conversationItem: '[data-test-id="omni-log-comment-item"]',
        conversationMessage: '[data-test-id="omni-log-item-message"]',
        conversationSubject: '[data-test-id="omni-header-subject"]',
        slaDivider: '[data-test-id="sla-divider-wrapper"]',
        ticketFooter: '[data-test-id="ticket-footer"]',
        // The visible "Apply macro" control is the faux-input, not the
        // zero-height `ticket-footer-macro-menu` popup container.
        macroMenu: '[data-test-id="ticket-footer-macro-menu-autocomplete-input"]',
        searchButton: '[data-test-id="header-toolbar-search-button"]',
        notificationsButton: '[data-test-id="global-notifications-button"]'
    };

    function isTicketPage() {
        return /\/agent\/tickets\/\d+/.test(location.href) ||
            !!document.querySelector(SELECTORS.ticketGrid);
    }

    function getTicketGrid() {
        return document.querySelector(SELECTORS.ticketGrid);
    }

    function getPanes() {
        return Array.from(document.querySelectorAll(SELECTORS.panesAll));
    }

    // Report which named selectors currently resolve — a cheap breakage signal
    // for dev/debugging if Zendesk changes its DOM.
    function smokeCheck() {
        const result = {};
        Object.entries(SELECTORS).forEach(([key, val]) => {
            if (typeof val === 'string') {
                result[key] = document.querySelectorAll(val).length;
            }
        });
        return result;
    }

    window.ZDZendeskSelectors = Object.assign({}, SELECTORS, {
        isTicketPage,
        getTicketGrid,
        getPanes,
        smokeCheck
    });
})();
