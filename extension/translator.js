// Translation system using Lingva Translate API

(function () {
    'use strict';

    const LINGVA_API_URL = 'https://lingva.ml/api/v1';
    const MAX_TEXT_LENGTH = 1000;

    // Available languages
    const LANGUAGES = [
        { code: 'en', name: 'English' },
        { code: 'es', name: 'Spanish' },
        { code: 'pt', name: 'Portuguese' },
        { code: 'fr', name: 'French' },
        { code: 'de', name: 'German' },
        { code: 'it', name: 'Italian' },
        { code: 'nl', name: 'Dutch' },
        { code: 'ru', name: 'Russian' },
        { code: 'zh', name: 'Chinese' },
        { code: 'ja', name: 'Japanese' },
        { code: 'ko', name: 'Korean' },
        { code: 'ar', name: 'Arabic' }
    ];

    /**
     * Translate text using Lingva Translate (Google Translate frontend)
     * @param {string} text - Text to translate
     * @param {string} targetLang - Target language code
     * @param {string} [sourceLang='auto'] - Source language code
     * @returns {Promise<string>} Translated text
     */
    async function translateText(text, targetLang, sourceLang = 'auto') {
        if (!text || text.trim() === '') return '';

        try {
            // Limit text length to avoid issues
            const truncatedText = text.length > MAX_TEXT_LENGTH
                ? text.substring(0, MAX_TEXT_LENGTH)
                : text;

            const encodedText = encodeURIComponent(truncatedText);
            const source = sourceLang === 'auto' ? 'auto' : sourceLang;

            const url = `${LINGVA_API_URL}/${source}/${targetLang}/${encodedText}`;

            const response = await fetch(url);

            if (!response.ok) {
                console.error('[Translator] HTTP error:', response.status);
                return 'Translation service unavailable. Please try again.';
            }

            const data = await response.json();

            if (data && data.translation) {
                return data.translation;
            } else {
                console.error('[Translator] No translation in response:', data);
                return 'Translation error. Please try again.';
            }
        } catch (err) {
            console.error('[Translator] Error:', err);
            return 'Translation failed. Check your connection.';
        }
    }

    /**
     * Open or toggle the translation panel
     */
    async function openTranslatePanel() {
        // Check if panel already exists
        let panel = document.querySelector('.zd-translate-panel');
        if (panel) {
            // Toggle visibility
            if (panel.style.display === 'none') {
                panel.style.display = 'flex';
            } else {
                panel.style.display = 'none';
            }
            return;
        }

        // Get saved target language preference
        const savedLang = localStorage.getItem('zd-translate-target') || 'en';

        // Build language options HTML
        const langOptionsHTML = LANGUAGES.map(lang =>
            `<option value="${lang.code}">${lang.name}</option>`
        ).join('');

        // Create panel
        panel = document.createElement('div');
        panel.className = 'zd-translate-panel';
        panel.innerHTML = `
            <div class="zd-translate-header">
                <h3 class="zd-translate-title">${window.ZDIcons ? window.ZDIcons.getIconHTML('translate', 18) : '🌐'} Translator</h3>
                <button class="zd-translate-close-btn" title="Close">×</button>
            </div>
            <div class="zd-translate-content">
                <div class="zd-translate-section">
                    <div class="zd-translate-label">Source Text (Auto-detect)</div>
                    <textarea class="zd-translate-source" placeholder="Paste or type text here to translate..."></textarea>
                </div>
                <div class="zd-translate-controls">
                    <label class="zd-translate-lang-label">
                        Translate to:
                        <select class="zd-translate-lang-select">
                            ${langOptionsHTML}
                        </select>
                    </label>
                </div>
                <div class="zd-translate-section">
                    <div class="zd-translate-label">
                        Translation
                        <button class="zd-translate-copy-btn" title="Copy translation">📋</button>
                    </div>
                    <textarea class="zd-translate-target" placeholder="Translation will appear here..." readonly></textarea>
                </div>
            </div>
            <div class="zd-translate-footer">
                <span class="zd-translate-status">Ready to translate</span>
                <span class="zd-translate-powered">Powered by Google Translate</span>
            </div>
        `;

        document.body.appendChild(panel);

        const sourceTextarea = panel.querySelector('.zd-translate-source');
        const targetTextarea = panel.querySelector('.zd-translate-target');
        const langSelect = panel.querySelector('.zd-translate-lang-select');
        const closeBtn = panel.querySelector('.zd-translate-close-btn');
        const copyBtn = panel.querySelector('.zd-translate-copy-btn');
        const statusEl = panel.querySelector('.zd-translate-status');

        // Set saved language
        langSelect.value = savedLang;

        // Auto-translate with debounce
        let translateTimeout;
        async function performTranslation() {
            const sourceText = sourceTextarea.value;
            const targetLang = langSelect.value;

            if (!sourceText || sourceText.trim() === '') {
                targetTextarea.value = '';
                statusEl.textContent = 'Ready to translate';
                return;
            }

            statusEl.textContent = 'Translating...';

            const translation = await translateText(sourceText, targetLang);
            targetTextarea.value = translation;

            statusEl.textContent = 'Translation complete';
        }

        sourceTextarea.addEventListener('input', () => {
            clearTimeout(translateTimeout);
            translateTimeout = setTimeout(performTranslation, 800);
        });

        langSelect.addEventListener('change', () => {
            localStorage.setItem('zd-translate-target', langSelect.value);
            if (sourceTextarea.value.trim()) {
                performTranslation();
            }
        });

        // Close button
        closeBtn.addEventListener('click', () => {
            panel.style.display = 'none';
        });

        // Copy button
        copyBtn.addEventListener('click', () => {
            const translation = targetTextarea.value;
            if (translation && translation.trim()) {
                navigator.clipboard.writeText(translation).then(() => {
                    statusEl.textContent = 'Translation copied!';
                    setTimeout(() => {
                        statusEl.textContent = 'Ready to translate';
                    }, 2000);
                }).catch((err) => {
                    console.error('[Clipboard] Copy failed:', err);
                    statusEl.textContent = 'Copy failed - try again';
                    setTimeout(() => {
                        statusEl.textContent = 'Ready to translate';
                    }, 2000);
                });
            }
        });

        // Apply theme if available
        if (window.ZDTheme && window.ZDTheme.applyThemeToDOM) {
            await window.ZDTheme.applyThemeToDOM();
        }
    }

    /**
     * Close the translation panel
     */
    function closeTranslatePanel() {
        const panel = document.querySelector('.zd-translate-panel');
        if (panel) {
            panel.style.display = 'none';
        }
    }

    // Public API
    window.ZDTranslator = {
        translateText,
        openTranslatePanel,
        closeTranslatePanel,
        LANGUAGES
    };
})();
