// Zendesk styling enhancements (ported from the ZD Styling userscript).
//
// Four independently-toggleable sub-features:
//   - stylingDarkMode    : color-preserving invert filter for app iframes the
//                          native Zendesk dark theme leaves glaring white.
//   - stylingResizeBoxes : vertical resize handle on multiline ticket fields.
//   - stylingWideMessages: full-width conversation messages.
//   - stylingChatBubbles : chat bubbles + an article role classifier that tags
//                          each comment (agent/bot/end-user/note) so the bubble
//                          CSS can shape it. The classifier fetches the sender's
//                          role from Zendesk's OWN same-origin API — no third
//                          party, no new permissions.
//
// Follows the customizer-apply.js pattern: read config, inject one <style> per
// enabled sub-feature, live-refresh on storage.onChanged. Exposes ZDStyling.

(function () {
    'use strict';

    // ZES chat-style ran with shouldRunInIframe: false; everything here styles
    // the top document, so stay out of same-origin child iframes (editor etc.).
    if (window.top !== window.self) return;

    const CONFIG_KEY = 'ZDCounter-config'; // STORAGE_KEYS.CONFIG

    function addStyle(id, css) {
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement('style');
            el.id = id;
            (document.head || document.documentElement).appendChild(el);
        }
        if (el.textContent !== css) el.textContent = css;
    }

    function removeStyle(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    /* ------------------------------------------------------------------ *
     * 1. Dark mode completion — invert(0.9) hue-rotate(180deg) on app
     * iframes only, gated on Zendesk's native html[data-theme="dark"].
     * ------------------------------------------------------------------ */
    const DARK_IFRAME_SELECTORS = [
        '[data-test-id="app-element"] iframe',
        'iframe[src*=".apps.zdusercontent.com"]',
        'iframe[title="a8cnotes"]'
    ];

    function darkGate(gatePrefix) {
        return DARK_IFRAME_SELECTORS.map((sel) => gatePrefix + ' ' + sel).join(',\n');
    }

    const DARK_MODE_COMPLETION_CSS =
        darkGate('html[data-theme="dark"]') + ' {\n' +
        '	filter: invert(0.9) hue-rotate(180deg);\n' +
        '	background-color: #fff;\n' +
        '}\n' +
        '@media (prefers-color-scheme: dark) {\n' +
        darkGate('html[data-theme="system"]') + ' {\n' +
        '	filter: invert(0.9) hue-rotate(180deg);\n' +
        '	background-color: #fff;\n' +
        '}\n' +
        '}\n';

    /* ------------------------------------------------------------------ *
     * 2. Resize info boxes — vertical resize on every multiline ticket
     * field; the original four keep their 300px starting height.
     * ------------------------------------------------------------------ */
    const RESIZE_BOXES_CSS =
        '[data-test-id^="ticket-form-field-multiline-field"] textarea {\n' +
        '	resize: vertical;\n' +
        '	overflow-y: auto !important;\n' +
        '}\n' +
        '[data-test-id="ticket-form-field-multiline-field-25337503"] textarea,\n' +
        '[data-test-id="ticket-form-field-multiline-field-24373076"] textarea,\n' +
        '[data-test-id="ticket-form-field-multiline-field_10901699622036"] textarea,\n' +
        '[data-test-id="ticket-form-field-multiline-field-22871957"] textarea {\n' +
        '	height: 300px !important;\n' +
        '	resize: vertical;\n' +
        '	overflow-y: scroll !important;\n' +
        '}\n';

    /* ------------------------------------------------------------------ *
     * 3. Full-width messages. The omni-log-item-message width rule lives
     * ONLY here (chat bubbles reuse it without redefining).
     * ------------------------------------------------------------------ */
    const MESSAGE_WIDTH_CSS =
        'div:has(> [data-test-id="omni-log-item-message"]),\n' +
        '[data-test-id="omni-log-item-message"] {\n' +
        '	width: 100%;\n' +
        '}\n' +
        'article[data-test-id="omni-log-comment-item"] {\n' +
        '	grid-template-columns: 80px auto 40px;\n' +
        '}\n';

    /* ------------------------------------------------------------------ *
     * 4. Chat style — bubbles keyed off data-zes-comment-type/-is-note set
     * by the classifier below. (The message-width block from the source is
     * intentionally omitted here; MESSAGE_WIDTH_CSS owns it.)
     * ------------------------------------------------------------------ */
    const CHAT_STYLE_CSS =
        'article[data-test-id="omni-log-comment-item"] {\n' +
        '	border-radius: 4px;\n' +
        '	margin-bottom: 20px !important;\n' +
        '	padding-top: 10px !important;\n' +
        '}\n' +
        '[data-zes-comment-type="bot"] {\n' +
        '	margin-left: 2%;\n' +
        '	margin-right: 2%;\n' +
        '}\n' +
        '[data-zes-comment-type="agent"] {\n' +
        '	margin-left: 10%;\n' +
        '	margin-right: 2%;\n' +
        '}\n' +
        '[data-zes-comment-type="bot"],\n' +
        '[data-zes-comment-type="agent"] {\n' +
        '	background: rgb(248, 249, 249) !important;\n' +
        '	border: 1px solid rgb(200, 200, 200) !important;\n' +
        '}\n' +
        '[data-zes-comment-type="end-user"] {\n' +
        '	margin-right: 10%;\n' +
        '	margin-left: 2%;\n' +
        '	background: rgb(235, 249, 249) !important;\n' +
        '	border: 1px solid rgb(180, 200, 200) !important;\n' +
        '}\n' +
        '[data-zes-comment-is-note="true"] {\n' +
        '	border: 1px solid rgb(254, 214, 168) !important;\n' +
        '	background: rgb(255, 247, 237) !important;\n' +
        '}\n' +
        '[data-test-id="omni-log-item-message"][type="internal"] {\n' +
        '	border: 0;\n' +
        '	background: transparent;\n' +
        '}\n' +
        'html[data-theme="dark"] [data-zes-comment-type="bot"],\n' +
        'html[data-theme="dark"] [data-zes-comment-type="agent"] {\n' +
        '	background: #26282d !important;\n' +
        '	border: 1px solid #43464e !important;\n' +
        '}\n' +
        'html[data-theme="dark"] [data-zes-comment-type="end-user"] {\n' +
        '	background: #1c2f33 !important;\n' +
        '	border: 1px solid #2f4a4e !important;\n' +
        '}\n' +
        'html[data-theme="dark"] [data-zes-comment-is-note="true"] {\n' +
        '	background: #332818 !important;\n' +
        '	border: 1px solid #6e5127 !important;\n' +
        '}\n' +
        'html[data-theme="dark"] article[data-zes-comment-type] [data-test-id="omni-log-item-message"] {\n' +
        '	color: #e9ebed;\n' +
        '}\n' +
        'html[data-theme="dark"] article[data-zes-comment-type] [data-test-id="omni-log-item-message"] :not(a):not([style*="background"]) {\n' +
        '	color: #e9ebed !important;\n' +
        '}\n';

    /* --------------------------------------------------------------
     * Chat-style article classifier. Tags each conversation article with
     * data-zes-comment-type and data-zes-comment-is-note.
     * -------------------------------------------------------------- */
    const ARTICLE_SELECTOR = 'article[data-test-id="omni-log-comment-item"]';
    const userTypeCache = {}; // user id -> Promise<comment type>
    const classifying = new WeakSet();

    function getUserCommentType(userId) {
        if (!userTypeCache[userId]) {
            userTypeCache[userId] = fetch('/api/v2/users/' + userId + '.json', {
                headers: { Accept: 'application/json' }
            })
                .then((response) => {
                    if (!response.ok) throw new Error('HTTP ' + response.status);
                    return response.json();
                })
                .then((data) => {
                    const role = data && data.user && data.user.role;
                    if (!role) return 'unknown';
                    // ZES maps Zendesk admins (bot accounts) to "bot".
                    return role === 'admin' ? 'bot' : role;
                })
                .catch(() => {
                    // Allow a retry on the next pass instead of caching failure.
                    delete userTypeCache[userId];
                    return 'unknown';
                });
        }
        return userTypeCache[userId];
    }

    function getCommentType(article) {
        if (article.querySelector('[data-test-id="omni-log-item-originated-from"] [aria-label*="via side conversation"]')) {
            return Promise.resolve('side-conversation');
        }
        const userLink = article.querySelector('[data-test-id="omni-log-comment-user-link"]');
        if (userLink && userLink.textContent.indexOf('Happy Bot') !== -1) {
            return Promise.resolve('bot');
        }
        const messageDiv = article.querySelector('div[data-test-id="omni-log-item-message"]');
        const typeAttribute = messageDiv ? messageDiv.getAttribute('type') : null;
        if (typeAttribute && typeAttribute !== 'internal') {
            return Promise.resolve(typeAttribute);
        }
        const senderLink = article.querySelector('[data-test-id="omni-log-item-sender"] a');
        const href = senderLink ? senderLink.getAttribute('href') : null;
        if (!href) return Promise.resolve('unknown');
        const userId = parseInt(href.replace(/\D/g, ''), 10);
        if (!userId) return Promise.resolve('unknown');
        return getUserCommentType(String(userId));
    }

    function classifyArticle(article) {
        if (article.hasAttribute('data-zes-comment-type') || classifying.has(article)) return;
        classifying.add(article);

        const isNote = !!article.querySelector('div[data-test-id="omni-log-internal-note-tag"]');
        article.setAttribute('data-zes-comment-is-note', isNote ? 'true' : 'false');

        getCommentType(article).then((commentType) => {
            classifying.delete(article);
            if (commentType === 'unknown') return; // untagged; next mutation retries
            article.setAttribute('data-zes-comment-type', commentType);
        });
    }

    function classifyAllIn(root) {
        if (root.matches && root.matches(ARTICLE_SELECTOR)) classifyArticle(root);
        if (root.querySelectorAll) root.querySelectorAll(ARTICLE_SELECTOR).forEach(classifyArticle);
    }

    let classifierStarted = false;
    function setupChatClassifier() {
        if (classifierStarted) return;
        classifierStarted = true;
        classifyAllIn(document.body);
        new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType !== Node.ELEMENT_NODE) return;
                    const host = node.closest ? node.closest(ARTICLE_SELECTOR) : null;
                    if (host) classifyArticle(host);
                    else classifyAllIn(node);
                });
            });
        }).observe(document.body, { childList: true, subtree: true });
    }

    /* -------------------------------------------------------------- */

    function applyConfig(cfg) {
        cfg = cfg || {};
        // All sub-features default ON (undefined -> enabled).
        if (cfg.stylingDarkMode !== false) addStyle('zd-styling-dark-mode-completion', DARK_MODE_COMPLETION_CSS);
        else removeStyle('zd-styling-dark-mode-completion');

        if (cfg.stylingResizeBoxes !== false) addStyle('zd-styling-resize-boxes', RESIZE_BOXES_CSS);
        else removeStyle('zd-styling-resize-boxes');

        if (cfg.stylingWideMessages !== false) addStyle('zd-styling-message-width', MESSAGE_WIDTH_CSS);
        else removeStyle('zd-styling-message-width');

        if (cfg.stylingChatBubbles !== false) {
            addStyle('zd-styling-chat-style', CHAT_STYLE_CSS);
            if (document.body) setupChatClassifier();
            else document.addEventListener('DOMContentLoaded', setupChatClassifier, { once: true });
        } else {
            removeStyle('zd-styling-chat-style');
            // If the classifier already started, it keeps tagging harmlessly; its
            // CSS is gone so tagged articles simply render unstyled.
        }
    }

    function refresh() {
        return new Promise((resolve) => {
            try {
                chrome.storage.sync.get([CONFIG_KEY], (res) => {
                    applyConfig((res && res[CONFIG_KEY]) || {});
                    resolve();
                });
            } catch (e) {
                applyConfig({});
                resolve();
            }
        });
    }

    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'sync' && changes[CONFIG_KEY]) refresh();
        });
    } catch (e) {
        /* ignore */
    }

    window.ZDStyling = { refresh };
    refresh();
})();
