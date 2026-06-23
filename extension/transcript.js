// Transcript extraction from Zendesk tickets.
//
// Scrapes the conversation log (bot / agent / end-user messages) from the
// current ticket. Used by the Linear search (local keyword extraction) and by
// the "Copy transcript" toolbar button. Everything happens locally — the
// transcript is never sent anywhere by this module.

(function () {
    'use strict';

    // --- Shared extraction: returns [{ senderType, text }] in order ---------
    // senderType is Zendesk's notion: 'bot' | 'agent' | 'end-user' |
    // 'internal-note' | 'unknown'. Formatting/labelling is done by callers.
    function extractMessages() {
        const articles = document.querySelectorAll('article[data-test-id="omni-log-comment-item"]');
        const messages = [];

        articles.forEach((article) => {
            const messageDiv = article.querySelector('div[data-test-id="omni-log-item-message"]');
            if (!messageDiv || messageDiv.getAttribute('aria-hidden') === 'true') return;

            // Clone so we never mutate the live Zendesk UI, then strip UI-only bits.
            const clone = messageDiv.cloneNode(true);
            [
                'svg[data-test-id="convo-log-item-read-indicator"]',
                'svg[data-test-id="convo-log-item-delivered-indicator"]',
                'div.signature',
                'button',
                '[data-zes-id]'
            ].forEach((sel) => clone.querySelectorAll(sel).forEach((el) => el.remove()));

            const text = clone.textContent.trim();
            if (!text) return;

            messages.push({ senderType: detectSenderType(article, messageDiv), text });
        });

        return messages;
    }

    function detectSenderType(article, messageDiv) {
        if (article.querySelector('div[data-test-id="omni-log-internal-note-tag"]')) {
            return 'internal-note';
        }
        // A sender name containing "Bot" is the most reliable bot signal.
        const senderLink = article.querySelector('[data-test-id="omni-log-comment-user-link"]');
        if (senderLink && /bot/i.test(senderLink.textContent)) return 'bot';

        const typeAttr = messageDiv.getAttribute('type');
        if (typeAttr && typeAttr !== 'internal') return typeAttr; // 'agent' | 'end-user'
        // Fallback: a named sender we couldn't classify is most likely an agent.
        return senderLink ? 'agent' : 'unknown';
    }

    function getTitle() {
        const el = document.querySelector('[data-test-id="ticket-pane-subject"]')
            || document.querySelector('h1[data-test-id="ticket-subject"]')
            || document.querySelector('[data-garden-id="chrome.global_header"] h1');
        return el ? el.textContent.trim() : 'Untitled Ticket';
    }

    // --- Existing API: transcript string with raw sender types (for AI/search)
    function extractTranscript() {
        try {
            const messages = extractMessages();
            if (messages.length === 0) {
                return { success: false, error: 'No conversation messages found in this ticket' };
            }
            const transcript = messages.map((m) => `${m.senderType}: ${m.text}`).join('\n\n');
            return { success: true, title: getTitle(), transcript };
        } catch (error) {
            console.error('[Transcript] Extraction failed:', error);
            return { success: false, error: error.message || 'Unknown error extracting transcript' };
        }
    }

    function formatForAI(title, transcript) {
        return `Ticket Title: ${title}\n\nConversation:\n${transcript}`;
    }

    // --- Copy API: clean Bot / User / Agent labels, no personal names -------
    const COPY_LABELS = {
        'bot': 'Bot',
        'end-user': 'User',
        'agent': 'Agent',
        'internal-note': 'Agent (note)',
        'unknown': 'Agent'
    };

    function labelFor(senderType) {
        return COPY_LABELS[senderType]
            || (senderType.charAt(0).toUpperCase() + senderType.slice(1));
    }

    // Returns { success, error, text } — the full transcript formatted for
    // pasting into an AI tool or anywhere, with role labels instead of names.
    function getCopyText() {
        try {
            const messages = extractMessages();
            if (messages.length === 0) {
                return { success: false, error: 'No conversation messages found in this ticket' };
            }
            const body = messages.map((m) => `${labelFor(m.senderType)}: ${m.text}`).join('\n\n');
            return { success: true, text: `${getTitle()}\n\n${body}` };
        } catch (error) {
            console.error('[Transcript] Copy extraction failed:', error);
            return { success: false, error: error.message || 'Unknown error extracting transcript' };
        }
    }

    window.ZDTranscript = {
        extractMessages,
        extractTranscript,
        formatForAI,
        getCopyText
    };
})();
