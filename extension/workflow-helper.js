// Zendesk workflow helpers (ported from the ZD Workflow Helper userscript).
//
// Runs in the page's MAIN world (declared world:"MAIN" in the manifest) so it
// can reach Zendesk's window.LotusReact internals — a content script's isolated
// world cannot. Because chrome.* is unavailable here, feature flags arrive from
// workflow-helper-bridge.js via the documentElement[data-zd-workflow-config]
// attribute + a 'zd-workflow-config' signal event. The feature functions read
// FEATURES at call time, so toggles apply live.
//
// Features: Draft Mode default (+ Ctrl+Enter send-without-draft), merge-checkbox
// uncheck, Stay-on-ticket default, Messaging as default reply channel.

(function () {
    'use strict';

    // Driven by the bridge (readFlags). Defaults ON until the first publish.
    const FEATURES = { draftMode: true, mergeUncheck: true, stayOnTicket: true, messagingDefault: true };
    const ATTR = 'data-zd-workflow-config';

    const LOG_PREFIX = '[ZD Workflow Helper]';
    const log = () => {};
    const warn = (...args) => console.warn(LOG_PREFIX, ...args);

    // -------------------------------------------------------------------------
    // Selectors. Zendesk keeps the DOM of ALL open ticket tabs alive inside
    // main#main_panes, so every ticket-pane query is scoped to the visible pane
    // via our own marker attribute.
    // -------------------------------------------------------------------------
    const MAIN_PANES = 'main#main_panes';
    const ACTIVE_ATTR = 'data-zwh-active';
    const ACTIVE_ID = `${MAIN_PANES} [${ACTIVE_ATTR}="true"]`;

    // -------------------------------------------------------------------------
    // Small utilities. No timed polling for element discovery — background tabs
    // throttle setTimeout; MutationObservers are not throttled.
    // -------------------------------------------------------------------------
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    function waitForElement(selector, { signal = null, timeoutMs = 10000 } = {}) {
        return new Promise((resolve) => {
            const existing = document.querySelector(selector);
            if (existing) {
                resolve(existing);
                return;
            }
            if (signal && signal.aborted) {
                resolve(null);
                return;
            }

            let timeoutId = null;
            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    cleanup();
                    resolve(el);
                }
            });

            function cleanup() {
                observer.disconnect();
                if (timeoutId !== null) clearTimeout(timeoutId);
                if (signal) signal.removeEventListener('abort', onAbort);
            }

            function onAbort() {
                cleanup();
                resolve(null);
            }

            if (signal) signal.addEventListener('abort', onAbort);
            if (timeoutMs > 0) {
                timeoutId = setTimeout(() => {
                    log(`Timeout waiting for '${selector}'`);
                    cleanup();
                    resolve(null);
                }, timeoutMs);
            }

            observer.observe(document.body, { childList: true, subtree: true, attributes: true });
        });
    }

    async function waitForElementSettled(selector, settleMs = 1000, { signal = null, timeoutMs = 10000 } = {}) {
        const element = await waitForElement(selector, { signal, timeoutMs });
        if (!element) return null;

        return new Promise((resolve) => {
            let timeoutId = null;
            const observer = new MutationObserver(() => {
                if (timeoutId !== null) clearTimeout(timeoutId);
                timeoutId = setTimeout(finish, settleMs);
            });

            function finish() {
                cleanup();
                resolve(element);
            }

            function cleanup() {
                observer.disconnect();
                if (timeoutId !== null) clearTimeout(timeoutId);
                if (signal) signal.removeEventListener('abort', onAbort);
            }

            function onAbort() {
                cleanup();
                resolve(null);
            }

            if (signal) {
                if (signal.aborted) {
                    onAbort();
                    return;
                }
                signal.addEventListener('abort', onAbort);
            }

            observer.observe(element, { childList: true, subtree: true, attributes: true, characterData: true });
            timeoutId = setTimeout(finish, settleMs);
        });
    }

    function debounceLeadingTrailing(fn, waitMs) {
        let timer = null;
        let pendingTrailing = false;

        return function debounced() {
            if (timer === null) fn(); // leading edge
            else pendingTrailing = true;
            clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                if (pendingTrailing) {
                    pendingTrailing = false;
                    fn(); // trailing edge
                }
            }, waitMs);
        };
    }

    // -------------------------------------------------------------------------
    // Page info.
    // -------------------------------------------------------------------------
    function getTicketNumber() {
        const match = window.location.pathname.match(/\/agent\/tickets\/(\d+)/);
        if (match && match[1]) {
            const ticketNumber = parseInt(match[1], 10);
            if (!isNaN(ticketNumber)) return ticketNumber;
        }
        return 1; // sentinel for "no ticket"
    }

    function getPageInfo() {
        const path = window.location.pathname;
        const pageType = path.includes('/agent/tickets/') ? 'TICKET' : 'OTHER';
        return {
            pageType,
            ticketNumber: pageType === 'TICKET' ? getTicketNumber() : 1
        };
    }

    // -------------------------------------------------------------------------
    // Zendesk internals.
    // -------------------------------------------------------------------------
    const DRAFT_MODE_KEY = 'isDraftMode'; // Zendesk's own localStorage flag
    const DRAFT_MODE_RETRIES = 10;

    function getLotusReact() {
        return window.LotusReact || null;
    }

    function getEditorProxy(ticketNumber) {
        const lotus = getLotusReact();
        if (!lotus || !lotus.editorProxy || !lotus.editorProxy.identityMap) return null;
        for (const [key, editorProxy] of lotus.editorProxy.identityMap.entries()) {
            const [ticket] = key.split(':');
            if (parseInt(ticket, 10) === ticketNumber) return editorProxy;
        }
        return null;
    }

    function isDraftModeEnabled() {
        return localStorage.getItem(DRAFT_MODE_KEY) === 'true';
    }

    function toggleDraftMode(ticketNumber) {
        const proxy = getEditorProxy(ticketNumber);
        if (proxy !== null) proxy.emit('proxy:toggleDraftMode');
    }

    async function enableDraftMode(ticketNumber) {
        let retries = DRAFT_MODE_RETRIES;
        while (!isDraftModeEnabled() && retries > 0) {
            toggleDraftMode(ticketNumber);
            await sleep(100);
            retries--;
        }
    }

    async function disableDraftMode(ticketNumber) {
        let retries = DRAFT_MODE_RETRIES;
        while (isDraftModeEnabled() && retries > 0) {
            toggleDraftMode(ticketNumber);
            await sleep(100);
            retries--;
        }
    }

    // --- Ticket lookup (agent session cookie against the same-origin REST API) -
    const ticketCache = new Map();

    async function getTicket(ticketNumber) {
        if (ticketNumber === 1) return null;
        if (ticketCache.has(ticketNumber)) return ticketCache.get(ticketNumber);
        const promise = fetch(`/api/v2/tickets/${ticketNumber}.json`, { credentials: 'same-origin' })
            .then((response) => (response.ok ? response.json() : null))
            .then((json) => (json && json.ticket ? json.ticket : null))
            .catch((error) => {
                warn('Failed to fetch ticket', ticketNumber, error);
                return null;
            });
        ticketCache.set(ticketNumber, promise);
        return promise;
    }

    function isTicketMessaging(ticket) {
        if (!ticket) return false;
        if (ticket.via && ticket.via.channel === 'native_messaging') return true;
        const zd = window.Zd;
        return !!(zd && zd.Ticket && zd.Ticket.ViasReverse && zd.Ticket.ViasReverse[ticket.via_id] === 'native_messaging');
    }

    async function setComposerChannel(ticketNumber, channel, signal) {
        const ticket = await getTicket(ticketNumber);
        if (ticket === null || !isTicketMessaging(ticket)) return;

        const button = await waitForElementSettled(
            `${ACTIVE_ID} button[data-test-id="omnichannel-channel-switcher-button"][aria-label="Email"]`,
            1000,
            { signal }
        );
        if (!button) return;

        const lotus = getLotusReact();
        if (!lotus) {
            warn('LotusReact not available; cannot switch composer channel.');
            return;
        }
        const composerActions = lotus.actionsFor('ConversationPane');
        lotus.dispatchAction(composerActions.updateComposerChannel(ticketNumber, channel, { toDefaultPublicChannel: false }));
        log(`Composer channel for ticket ${ticketNumber} set to ${channel}`);
    }

    // -------------------------------------------------------------------------
    // Feature: Draft Mode.
    // -------------------------------------------------------------------------
    async function runDraftMode(pageInfo, signal) {
        const button = await waitForElement(`${ACTIVE_ID} [data-test-id="rich-text-editor-draft-mode-button"]`, {
            signal,
            timeoutMs: 0
        });
        if (!button || signal.aborted) return;
        if (button.getAttribute('data-active') === 'false') {
            log(`Enabling Draft Mode on ticket ${pageInfo.ticketNumber}`);
            await enableDraftMode(pageInfo.ticketNumber);
        }
    }

    // Ctrl+Enter: temporarily drop out of Draft Mode, send, re-enable.
    function setupDraftModeHotkey() {
        document.addEventListener('keydown', async (event) => {
            if (!FEATURES.draftMode || !event.ctrlKey || event.key !== 'Enter') return;
            const pageInfo = getPageInfo();
            if (pageInfo.pageType !== 'TICKET') return;
            log('Ctrl + Enter pressed');
            await disableDraftMode(pageInfo.ticketNumber);
            const sendButton = document.querySelector(`${ACTIVE_ID} [data-test-id="omnichannel-omnicomposer-send-button"]`);
            if (sendButton) sendButton.click();
            await enableDraftMode(pageInfo.ticketNumber);
        });
    }

    // -------------------------------------------------------------------------
    // Feature: Ticket Merge Unchecker. The merge dialog is a single
    // document-level modal, so these selectors are intentionally document-wide.
    // -------------------------------------------------------------------------
    const MERGE_TRIGGER_SELECTOR = '#merge_form input[type="submit"], #suggestion_columns a';

    function setupMergeUncheck() {
        document.addEventListener('click', (event) => {
            if (!FEATURES.mergeUncheck) return;
            const target = event.target instanceof Element ? event.target : null;
            if (!target || !target.closest(MERGE_TRIGGER_SELECTOR)) return;
            for (const name of ['source_is_public', 'target_is_public']) {
                waitForElement(`input[name="${name}"]`).then((checkbox) => {
                    if (checkbox && checkbox.checked) checkbox.click(); // keep Zendesk state in sync
                    if (checkbox) checkbox.checked = false;
                });
            }
        });
    }

    // -------------------------------------------------------------------------
    // Feature: Stay on Ticket.
    // -------------------------------------------------------------------------
    async function runStayOnTicket(pageInfo, signal) {
        const menuButton = await waitForElementSettled(
            `${ACTIVE_ID} [data-tracking-id=ticket-footer-post-save-actions-menu-button]`,
            250,
            { signal }
        );
        if (!menuButton || signal.aborted) return;

        let alreadySet = false;
        for (const child of menuButton.children) {
            if (child.textContent && child.textContent.includes('Stay on ticket')) {
                alreadySet = true;
                break;
            }
        }
        if (alreadySet) return;

        menuButton.click();

        const stayOption = await waitForElement(`${ACTIVE_ID} [data-tracking-id=ticket-footer-post-save-actionsstay_on_ticket]`, {
            signal
        });
        if (!stayOption || signal.aborted) return;

        const menu = document.querySelector(`${ACTIVE_ID} [data-test-id="ticket-footer-post-save-actions-menu"]`);
        if (menu) menu.style.visibility = 'hidden';
        stayOption.click();
        if (menu) menu.style.visibility = 'visible';
        log(`"Stay on ticket" set as default on ticket ${pageInfo.ticketNumber}`);
    }

    // -------------------------------------------------------------------------
    // Feature: Messaging as default channel.
    // -------------------------------------------------------------------------
    async function runSelectMessaging(pageInfo, signal) {
        const element = await waitForElement(`${ACTIVE_ID} [data-test-id="omnichannel-channel-switcher-button"][data-channel="web"]`, {
            signal
        });
        if (!element || signal.aborted) return;
        await setComposerChannel(pageInfo.ticketNumber, 'native_messaging', signal);
    }

    // -------------------------------------------------------------------------
    // Active pane tracking.
    // -------------------------------------------------------------------------
    let lastPageInfoString = null;
    let currentRunAbort = null;

    function updateActivePane(mainPanes) {
        for (const pane of mainPanes.children) {
            const computed = getComputedStyle(pane);
            const shouldBeActive = computed.visibility !== 'hidden' && computed.display !== 'none';
            const isActive = pane.getAttribute(ACTIVE_ATTR) === 'true';

            if (shouldBeActive && !isActive) pane.setAttribute(ACTIVE_ATTR, 'true');
            else if (!shouldBeActive && isActive) pane.removeAttribute(ACTIVE_ATTR);
        }

        const pageInfo = getPageInfo();
        const pageInfoString = JSON.stringify(pageInfo);
        if (lastPageInfoString === pageInfoString) return;
        lastPageInfoString = pageInfoString;
        log('Active tab changed:', pageInfo);

        if (currentRunAbort) currentRunAbort.abort();
        currentRunAbort = new AbortController();
        const signal = currentRunAbort.signal;

        if (pageInfo.pageType !== 'TICKET') return;

        if (FEATURES.stayOnTicket) {
            runStayOnTicket(pageInfo, signal).catch((error) => warn('stayOnTicket failed:', error));
        }
        if (FEATURES.messagingDefault) {
            runSelectMessaging(pageInfo, signal).catch((error) => warn('messagingDefault failed:', error));
        }

        if (FEATURES.draftMode) {
            Promise.allSettled([
                waitForElementSettled(`${ACTIVE_ID} article`, 100, { signal }),
                waitForElementSettled(`${ACTIVE_ID} [data-test-id="omni-log-comment-item"]`, 100, { signal })
            ]).then(() => {
                if (!signal.aborted) {
                    runDraftMode(pageInfo, signal).catch((error) => warn('draftMode failed:', error));
                }
            });
        }
    }

    async function setupActivePaneTracking() {
        const mainPanesEl = await waitForElement(MAIN_PANES, { timeoutMs: 30000 });
        if (!mainPanesEl) {
            warn('Main panes element not found; script inactive.');
            return;
        }

        const debouncedUpdate = debounceLeadingTrailing(() => updateActivePane(mainPanesEl), 150);

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.target.parentNode === mainPanesEl) debouncedUpdate();
                else if (mutation.type === 'childList' && mutation.target === mainPanesEl) debouncedUpdate();
            }
        });

        observer.observe(mainPanesEl, {
            childList: true,
            attributes: true,
            attributeFilter: ['style', 'class'],
            subtree: true
        });

        updateActivePane(mainPanesEl);

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) updateActivePane(mainPanesEl);
        });
    }

    // -------------------------------------------------------------------------
    // Config bridge + boot. Feature functions read FEATURES at call time, so the
    // setups are wired ONCE and toggles take effect live.
    // -------------------------------------------------------------------------
    function readFlags() {
        try {
            const raw = document.documentElement.getAttribute(ATTR);
            if (!raw) return;
            const f = JSON.parse(raw);
            FEATURES.draftMode = f.wfDraftMode !== false;
            FEATURES.mergeUncheck = f.wfMergeUncheck !== false;
            FEATURES.stayOnTicket = f.wfStayOnTicket !== false;
            FEATURES.messagingDefault = f.wfMessagingDefault !== false;
        } catch (e) {
            /* keep previous flags */
        }
    }

    let booted = false;
    function boot() {
        if (booted) return;
        booted = true;
        setupDraftModeHotkey();
        setupMergeUncheck();
        setupActivePaneTracking();
        log('Loaded. Features:', FEATURES);
    }

    document.addEventListener('zd-workflow-config', () => { readFlags(); boot(); });
    readFlags();
    if (document.documentElement.getAttribute(ATTR)) boot();

    window.ZDWorkflowHelper = { readFlags };
})();
