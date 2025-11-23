// Transcript extraction from Zendesk tickets
// This module extracts the full conversation history from a Zendesk ticket, including
// all messages from bots, agents, and end-users. Used by the AI-powered Linear search
// to understand the context of the ticket and find similar issues.
//
// Inspired by ZES (Zendesk Enhancement Suite) Copy Transcript feature, but simplified
// for our specific use case of feeding conversation context to AI for search query generation.

(function () {
    'use strict';

    /**
     * Extract conversation transcript from current Zendesk ticket
     *
     * This is the main entry point for transcript extraction. It scrapes the Zendesk DOM
     * to find the ticket title and all conversation messages, formats them into a readable
     * transcript, and returns the result.
     *
     * The function is defensive and tries multiple DOM selectors since Zendesk's structure
     * can vary between different views (tickets, chats, etc.) and may change with updates.
     *
     * @returns {Object} Result object with the following properties:
     *   - success: {boolean} Whether extraction succeeded
     *   - title: {string} Ticket subject/title (or 'Untitled Ticket' if not found)
     *   - transcript: {string} Full conversation with sender types (e.g., "agent: message\n\n")
     *   - error: {string} [Optional] Error message if extraction failed
     *
     * @example
     * const result = extractTranscript();
     * if (result.success) {
     *   console.log('Title:', result.title);
     *   console.log('Transcript:', result.transcript);
     * }
     */
    function extractTranscript() {
        try {
            // STEP 1: Extract ticket title/subject
            // Try multiple selectors because Zendesk uses different DOM structures
            // depending on the ticket view (agent workspace, chat, etc.)
            let titleElement = document.querySelector('[data-test-id="ticket-pane-subject"]');
            if (!titleElement) {
                // Fallback for different Zendesk views
                titleElement = document.querySelector('h1[data-test-id="ticket-subject"]');
            }
            if (!titleElement) {
                // Last resort: try the global header
                titleElement = document.querySelector('[data-garden-id="chrome.global_header"] h1');
            }
            const title = titleElement ? titleElement.textContent.trim() : 'Untitled Ticket';

            // STEP 2: Find all conversation messages in the ticket
            // We search the entire document (not limited to a specific pane) because
            // Zendesk's layout can vary. Each message is an <article> element with
            // the data-test-id="omni-log-comment-item" attribute.
            const articles = document.querySelectorAll('article[data-test-id="omni-log-comment-item"]');

            if (articles.length === 0) {
                return { success: false, error: 'No conversation messages found in this ticket' };
            }

            // STEP 3: Build the transcript by iterating through all messages
            let transcript = '';

            articles.forEach((article) => {
                // Each article contains one message in the conversation
                // Find the div that contains the actual message content
                const messageDiv = article.querySelector('div[data-test-id="omni-log-item-message"]');

                // Skip hidden messages or messages without content
                // (Zendesk sometimes has hidden system messages we don't need)
                if (!messageDiv || messageDiv.getAttribute('aria-hidden') === 'true') {
                    return;
                }

                // IMPORTANT: Clone the node to avoid modifying the actual Zendesk UI
                // We need to clean up the message before extracting text
                const messageDivClone = messageDiv.cloneNode(true);

                // Remove UI-only elements that shouldn't be in the transcript
                // These are visual indicators and buttons that don't contain message content
                const selectorsToRemove = [
                    'svg[data-test-id="convo-log-item-read-indicator"]',      // Read receipts
                    'svg[data-test-id="convo-log-item-delivered-indicator"]', // Delivery status
                    'div.signature',                                           // Email signatures
                    'button',                                                  // Action buttons
                    '[data-zes-id]'                                           // ZES extension elements
                ];

                selectorsToRemove.forEach(selector => {
                    messageDivClone.querySelectorAll(selector).forEach(el => el.remove());
                });

                // Extract the clean message text
                const messageText = messageDivClone.textContent.trim();

                // Skip empty messages (after cleanup)
                if (!messageText) {
                    return;
                }

                // STEP 4: Determine who sent this message
                // We prefix each message with the sender type (bot, agent, end-user, etc.)
                // This helps the AI understand the conversation flow
                let senderType = 'unknown';

                // Check if this is an internal note (only visible to agents)
                const isNote = article.querySelector('div[data-test-id="omni-log-internal-note-tag"]');
                if (isNote) {
                    senderType = 'internal-note';
                } else {
                    // Try to get sender type from Zendesk's type attribute
                    const typeAttr = messageDiv.getAttribute('type');
                    if (typeAttr && typeAttr !== 'internal') {
                        senderType = typeAttr; // Usually 'agent' or 'end-user'
                    } else {
                        // Fallback: Look at the sender's name to guess type
                        const senderLink = article.querySelector('[data-test-id="omni-log-comment-user-link"]');
                        if (senderLink) {
                            const senderText = senderLink.textContent;
                            if (senderText.includes('Bot')) {
                                senderType = 'bot';
                            } else {
                                // Default assumption: if we can't determine, assume agent
                                senderType = 'agent';
                            }
                        }
                    }
                }

                // Add this message to the transcript with format: "sender: message\n\n"
                // Double newlines make it easy to separate messages for AI processing
                transcript += `${senderType}: ${messageText}\n\n`;
            });

            if (!transcript) {
                return { success: false, error: 'Could not extract any messages from conversation' };
            }

            return {
                success: true,
                title: title,
                transcript: transcript.trim()
            };

        } catch (error) {
            console.error('[Transcript] Extraction failed:', error);
            return {
                success: false,
                error: error.message || 'Unknown error extracting transcript'
            };
        }
    }

    /**
     * Format transcript for AI consumption
     *
     * This is a simple helper function that takes the extracted title and transcript
     * and formats them in a way that's easy for AI models to understand and process.
     *
     * The format is straightforward:
     * - Ticket Title: [title]
     * - Conversation: [full transcript with sender types]
     *
     * This structured format helps the AI quickly identify:
     * 1. What the ticket is about (from the title)
     * 2. The full conversation context (from the transcript)
     *
     * @param {string} title - Ticket title/subject from Zendesk
     * @param {string} transcript - Full conversation with sender types (e.g., "agent: message\n\nend-user: reply\n\n")
     * @returns {string} Formatted text ready to be sent to AI API
     *
     * @example
     * const formatted = formatForAI('Login Issue', 'end-user: Cannot login\n\nagent: Try resetting password');
     * // Returns: "Ticket Title: Login Issue\n\nConversation:\nend-user: Cannot login\n\nagent: Try resetting password"
     */
    function formatForAI(title, transcript) {
        return `Ticket Title: ${title}\n\nConversation:\n${transcript}`;
    }

    // EXPORT TO GLOBAL SCOPE
    // This module uses the IIFE (Immediately Invoked Function Expression) pattern
    // to create a private scope and avoid polluting the global namespace with
    // internal variables. However, we need to expose the public API functions
    // so other parts of the extension (specifically linear-panel.js) can use them.
    //
    // We create a global object called "ZDTranscript" on the window object that
    // contains our two public functions:
    // - extractTranscript(): Gets the conversation from the current Zendesk ticket
    // - formatForAI(): Formats transcript data for AI processing
    //
    // Usage from other scripts:
    //   const result = window.ZDTranscript.extractTranscript();
    //   if (result.success) {
    //     const formatted = window.ZDTranscript.formatForAI(result.title, result.transcript);
    //   }
    window.ZDTranscript = {
        extractTranscript,
        formatForAI
    };

})();
