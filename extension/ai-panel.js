// AI Copilot panel with Google Gemini integration

(function () {
    'use strict';

    // Chat history for context
    let aiChatHistory = [];

    /**
     * Show AI setup modal when no API key is configured
     */
    function showAISetupModal() {
        // Check if AI setup modal already exists
        const existingModal = document.querySelector('.zd-ai-setup-modal');
        if (existingModal) return;

        const overlay = document.createElement('div');
        overlay.className = 'zd-modal-overlay zd-ai-setup-modal';

        const panel = document.createElement('div');
        panel.className = 'zd-log-panel';
        panel.style.width = '480px';
        panel.style.maxWidth = '90vw';

        panel.innerHTML = `
            <h2 class="zd-log-title">${window.ZDIcons ? window.ZDIcons.getIconHTML('ai', 20) : '🤖'} AI Copilot Setup</h2>

            <div style="font-size: 13px; line-height: 1.6; margin-bottom: 20px; color: var(--zd-text);">
                <p style="margin: 0 0 16px 0;">
                    Get a free Google Gemini API key to enable AI assistance for your support work.
                </p>

                <div style="background: var(--zd-bg-secondary); padding: 12px; border-radius: 4px; margin-bottom: 16px;">
                    <div style="font-weight: 600; margin-bottom: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--zd-accent);">
                        Quick Setup
                    </div>
                    <ol style="margin: 0; padding-left: 18px; line-height: 1.8; color: var(--zd-text-secondary);">
                        <li>Click "Get API Key" below to visit Google AI Studio</li>
                        <li>Sign in and click "Create API Key"</li>
                        <li>Copy your key (starts with "AIza...")</li>
                        <li>Click "Configure" and paste it in Settings</li>
                    </ol>
                </div>

                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 16px;">
                    <div style="text-align: center; padding: 12px 8px; background: var(--zd-bg-secondary); border-radius: 4px;">
                        <div style="font-size: 18px; margin-bottom: 4px;">✓</div>
                        <div style="font-size: 11px; font-weight: 500; color: var(--zd-text-secondary);">100% Free</div>
                    </div>
                    <div style="text-align: center; padding: 12px 8px; background: var(--zd-bg-secondary); border-radius: 4px;">
                        <div style="font-size: 18px; margin-bottom: 4px;">⚡</div>
                        <div style="font-size: 11px; font-weight: 500; color: var(--zd-text-secondary);">60 req/min</div>
                    </div>
                    <div style="text-align: center; padding: 12px 8px; background: var(--zd-bg-secondary); border-radius: 4px;">
                        <div style="font-size: 18px; margin-bottom: 4px;">🔒</div>
                        <div style="font-size: 11px; font-weight: 500; color: var(--zd-text-secondary);">No card</div>
                    </div>
                </div>
            </div>

            <div class="zd-log-footer">
                <button class="zd-ai-setup-close-btn">Cancel</button>
                <button class="zd-ai-setup-get-key-btn" style="background: var(--zd-accent-green);">Get API Key</button>
                <button class="zd-ai-setup-settings-btn">Configure</button>
            </div>
        `;

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        // Get API key button
        overlay.querySelector('.zd-ai-setup-get-key-btn').addEventListener('click', () => {
            window.open('https://aistudio.google.com/app/apikey', '_blank');
        });

        // Open settings button
        overlay.querySelector('.zd-ai-setup-settings-btn').addEventListener('click', () => {
            overlay.remove();
            // Call settings open if available
            if (window.ZDSettings && window.ZDSettings.openSettings) {
                window.ZDSettings.openSettings();
            }
        });

        // Close button
        overlay.querySelector('.zd-ai-setup-close-btn').addEventListener('click', () => {
            overlay.remove();
        });

        // Click outside to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });
    }

    /**
     * Call AI API via background service worker
     * @param {string} userMessage - User's message
     * @returns {Promise<string>} AI response
     */
    async function callAI(userMessage) {
        try {
            const cfg = await window.ZDStorage.getConfig();

            const response = await chrome.runtime.sendMessage({
                type: 'AI_CHAT',
                message: userMessage,
                history: aiChatHistory,
                apiKey: cfg.aiApiKey
            });

            if (response.success) {
                const aiResponse = response.response;

                // Add to history
                aiChatHistory.push({ role: 'user', content: userMessage });
                aiChatHistory.push({ role: 'assistant', content: aiResponse });

                // Keep history limited to last 10 messages (5 exchanges)
                if (aiChatHistory.length > 10) {
                    aiChatHistory = aiChatHistory.slice(-10);
                }

                return aiResponse;
            } else {
                console.error('[AI Copilot] Error from background:', response.error);
                return response.error || 'Sorry, the AI service is unavailable right now. Please try again later.';
            }
        } catch (err) {
            console.error('[AI Copilot] Error:', err);
            return 'An error occurred. Please check your connection and try again.';
        }
    }

    /**
     * Strip markdown formatting from text
     * @param {string} text - Text with markdown
     * @returns {string} Plain text
     */
    function stripMarkdown(text) {
        return text
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\*(.+?)\*/g, '$1')
            .replace(/__(.+?)__/g, '$1')
            .replace(/_(.+?)_/g, '$1')
            .replace(/`(.+?)`/g, '$1')
            .replace(/~~(.+?)~~/g, '$1');
    }

    /**
     * Escape HTML and convert newlines to br
     * @param {string} text - Text to escape
     * @returns {string} Escaped HTML
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/\n/g, '<br>');
    }

    /**
     * Open AI Copilot panel
     */
    async function openAIPanel() {
        // Check if API key is configured
        const cfg = await window.ZDStorage.getConfig();
        if (!cfg.aiApiKey || cfg.aiApiKey.trim() === '') {
            showAISetupModal();
            return;
        }

        // Check if panel already exists
        let panel = document.querySelector('.zd-ai-panel');
        if (panel) {
            if (panel.style.display === 'none') {
                panel.style.display = 'flex';
            } else {
                panel.style.display = 'none';
            }
            return;
        }

        // Create panel
        panel = document.createElement('div');
        panel.className = 'zd-ai-panel';
        panel.innerHTML = `
            <div class="zd-ai-header">
                <h3 class="zd-ai-title">${window.ZDIcons ? window.ZDIcons.getIconHTML('ai', 18) : '🤖'} AI Copilot</h3>
                <div class="zd-ai-header-buttons">
                    <button class="zd-ai-clear-btn" title="Clear chat">Clear</button>
                    <button class="zd-ai-close-btn" title="Close">×</button>
                </div>
            </div>
            <div class="zd-ai-chat-container">
            </div>
            <div class="zd-ai-input-area">
                <textarea class="zd-ai-input" placeholder="Ask me anything..." rows="1"></textarea>
                <button class="zd-ai-send-btn">Send</button>
            </div>
            <div class="zd-ai-footer">
                <span class="zd-ai-status">Ready</span>
                <span class="zd-ai-powered">Powered by Google Gemini</span>
            </div>
        `;

        document.body.appendChild(panel);

        const chatContainer = panel.querySelector('.zd-ai-chat-container');
        const inputTextarea = panel.querySelector('.zd-ai-input');
        const sendBtn = panel.querySelector('.zd-ai-send-btn');
        const closeBtn = panel.querySelector('.zd-ai-close-btn');
        const clearBtn = panel.querySelector('.zd-ai-clear-btn');
        const statusEl = panel.querySelector('.zd-ai-status');

        // Helper to add message to chat
        function addAIMessage(role, content) {
            const msgEl = document.createElement('div');
            msgEl.className = `zd-ai-message ${role}`;

            const displayContent = stripMarkdown(content);

            msgEl.innerHTML = `
                <div class="zd-ai-message-role">${role === 'user' ? 'You' : 'AI'}</div>
                <div class="zd-ai-message-content">${escapeHtml(displayContent)}</div>
                ${role === 'assistant' ? '<button class="zd-ai-copy-btn" title="Copy message">Copy</button>' : ''}
            `;

            chatContainer.appendChild(msgEl);

            if (role === 'assistant') {
                const copyBtn = msgEl.querySelector('.zd-ai-copy-btn');
                copyBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(displayContent.replace(/<br>/g, '\n')).then(() => {
                        copyBtn.textContent = 'Copied!';
                        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
                    }).catch((err) => {
                        console.error('[Clipboard] Copy failed:', err);
                        copyBtn.textContent = 'Failed';
                        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
                    });
                });
            }

            chatContainer.scrollTop = chatContainer.scrollHeight;
        }

        // Add welcome message
        addAIMessage('assistant', '👋 Hi! I\'m your AI assistant. I can help you with:\n\n• Troubleshooting customer issues\n• Drafting professional responses\n• Answering technical questions\n• Explaining concepts\n\nHow can I help you today?');

        // Send message function
        async function sendMessage() {
            const message = inputTextarea.value.trim();
            if (!message) return;

            addAIMessage('user', message);
            inputTextarea.value = '';
            inputTextarea.style.height = 'auto';

            statusEl.textContent = 'Thinking...';
            sendBtn.disabled = true;

            const aiResponse = await callAI(message);
            addAIMessage('assistant', aiResponse);

            statusEl.textContent = 'Ready';
            sendBtn.disabled = false;
            inputTextarea.focus();
        }

        // Event listeners
        sendBtn.addEventListener('click', sendMessage);

        inputTextarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        inputTextarea.addEventListener('input', () => {
            inputTextarea.style.height = 'auto';
            inputTextarea.style.height = Math.min(inputTextarea.scrollHeight, 120) + 'px';
        });

        closeBtn.addEventListener('click', () => {
            panel.style.display = 'none';
        });

        clearBtn.addEventListener('click', () => {
            if (confirm('Clear all chat history?')) {
                aiChatHistory = [];
                chatContainer.innerHTML = '';
                addAIMessage('assistant', 'Chat cleared. How can I help you?');
            }
        });

        // Apply theme
        if (window.ZDTheme && window.ZDTheme.applyThemeToDOM) {
            await window.ZDTheme.applyThemeToDOM();
        }
    }

    /**
     * Close AI panel
     */
    function closeAIPanel() {
        const panel = document.querySelector('.zd-ai-panel');
        if (panel) {
            panel.style.display = 'none';
        }
    }

    /**
     * Clear chat history
     */
    function clearHistory() {
        aiChatHistory = [];
    }

    // Public API
    window.ZDAIPanel = {
        openAIPanel,
        closeAIPanel,
        showAISetupModal,
        callAI,
        clearHistory
    };
})();
