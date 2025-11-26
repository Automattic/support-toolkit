// LINEAR SEARCH PANEL UI COMPONENT
// ===================================
// This module provides a right-side panel for searching Linear issues directly from Zendesk.
//
// KEY FEATURES:
// 1. **Keyword Suggestions** - Privacy-first approach:
//    - Extracts ticket conversation locally using transcript.js
//    - Analyzes keywords locally (no external APIs, no data leaves browser)
//    - Shows clickable keyword chips for quick searching
//    - Each chip searches Linear when clicked
//
// 2. **Manual Search** - Traditional search with:
//    - Team filtering (or "All Teams" to search everything)
//    - Status filtering (In Progress, Done, etc.)
//    - Free-text search input
//
// 3. **Autocomplete Team Dropdown** - Type to filter teams, shows team keys
//
// 4. **Click-to-Open** - Clicking any result opens the Linear issue in a new tab
//
// ARCHITECTURE:
// - IIFE pattern for private scope
// - Global exports on window.ZDLinearPanel
// - All processing happens client-side (privacy-first)
// - Uses ZDTranscript module for ticket extraction
// - Uses ZDLinear module for GraphQL API calls
//
// DEPENDENCIES:
// - window.ZDStorage: Config management (API keys)
// - window.ZDLinear: Linear GraphQL API wrapper
// - window.ZDTranscript: Zendesk ticket extraction
// - window.ZDIcons: Icon rendering (optional, falls back to emoji)

(function () {
    'use strict';

    let linearPanelEl = null;
    let isLinearPanelVisible = false;
    let allTeams = [];
    let selectedTeam = null;
    let workflowStates = [];
    let showTeamDropdown = false;

    /**
     * Show Linear setup modal when no API key is configured
     */
    function showLinearSetupModal() {
        // Check if Linear setup modal already exists
        const existingModal = document.querySelector('.zd-linear-setup-modal');
        if (existingModal) return;

        const overlay = document.createElement('div');
        overlay.className = 'zd-modal-overlay zd-linear-setup-modal';

        const panel = document.createElement('div');
        panel.className = 'zd-log-panel';
        panel.style.width = '480px';
        panel.style.maxWidth = '90vw';

        panel.innerHTML = `
            <h2 class="zd-log-title">${window.ZDIcons ? window.ZDIcons.getIconHTML('linear', 20) : '⚡'} Linear Setup</h2>

            <div style="font-size: 13px; line-height: 1.6; margin-bottom: 20px; color: var(--zd-text);">
                <p style="margin: 0 0 16px 0;">
                    Connect your Linear workspace to search and reference issues directly from Zendesk.
                </p>

                <div style="background: var(--zd-bg-secondary); padding: 12px; border-radius: 4px; margin-bottom: 16px;">
                    <div style="font-weight: 600; margin-bottom: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--zd-accent);">
                        Quick Setup
                    </div>
                    <ol style="margin: 0; padding-left: 18px; line-height: 1.8; color: var(--zd-text-secondary);">
                        <li>Click "Get Linear API Key" below</li>
                        <li>Sign in to Linear and create a personal API key</li>
                        <li>Copy your API key (starts with "lin_api_")</li>
                        <li>Click "Configure" and paste it in Settings</li>
                    </ol>
                </div>

                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 16px;">
                    <div style="text-align: center; padding: 12px 8px; background: var(--zd-bg-secondary); border-radius: 4px;">
                        <div style="font-size: 18px; margin-bottom: 4px;">🔒</div>
                        <div style="font-size: 11px; font-weight: 500; color: var(--zd-text-secondary);">Local Storage</div>
                    </div>
                    <div style="text-align: center; padding: 12px 8px; background: var(--zd-bg-secondary); border-radius: 4px;">
                        <div style="font-size: 18px; margin-bottom: 4px;">⚡</div>
                        <div style="font-size: 11px; font-weight: 500; color: var(--zd-text-secondary);">Real-time Search</div>
                    </div>
                    <div style="text-align: center; padding: 12px 8px; background: var(--zd-bg-secondary); border-radius: 4px;">
                        <div style="font-size: 18px; margin-bottom: 4px;">🔗</div>
                        <div style="font-size: 11px; font-weight: 500; color: var(--zd-text-secondary);">Direct Links</div>
                    </div>
                </div>
            </div>

            <div class="zd-log-footer">
                <button class="zd-linear-setup-close-btn">Cancel</button>
                <button class="zd-linear-setup-get-key-btn" style="background: var(--zd-accent-green);">Get Linear API Key</button>
                <button class="zd-linear-setup-settings-btn">Configure</button>
            </div>
        `;

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        // Get API key button
        overlay.querySelector('.zd-linear-setup-get-key-btn').addEventListener('click', () => {
            window.open('https://linear.app/a8c/settings/account/security', '_blank');
        });

        // Open settings button
        overlay.querySelector('.zd-linear-setup-settings-btn').addEventListener('click', () => {
            overlay.remove();
            // Dispatch event to open settings
            window.dispatchEvent(new CustomEvent('zd-open-settings'));
        });

        // Close button
        overlay.querySelector('.zd-linear-setup-close-btn').addEventListener('click', () => {
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
     * Create Linear panel UI
     */
    function createLinearPanel() {
        if (linearPanelEl) return linearPanelEl;

        const panel = document.createElement('div');
        panel.className = 'zd-linear-panel';
        panel.style.display = 'none';

        panel.innerHTML = `
            <div class="zd-linear-panel-header">
                <div class="zd-linear-panel-title">
                    ${window.ZDIcons ? window.ZDIcons.getIconHTML('linear', 20) : '⚡'}
                    <span>Linear Issues</span>
                </div>
                <button class="zd-linear-close-btn" title="Close panel">×</button>
            </div>

            <div class="zd-linear-filters">
                <!-- Keyword Suggestions -->
                <div class="zd-linear-keyword-section">
                    <button id="zd-linear-keyword-btn" class="zd-linear-keyword-btn" title="Extract keywords from this ticket to help you search">
                        Get Keywords from Ticket
                    </button>
                    <div id="zd-linear-keyword-chips" class="zd-linear-keyword-chips" style="display: none;"></div>
                </div>

                <!-- Team Selection with Autocomplete -->
                <div class="zd-linear-filter-group">
                    <label class="zd-linear-filter-label">Product (Team)</label>
                    <div class="zd-linear-team-input-wrapper">
                        <input
                            type="text"
                            id="zd-linear-team-input"
                            class="zd-linear-team-input"
                            placeholder="Type to search teams..."
                            autocomplete="off"
                        />
                        <div id="zd-linear-team-dropdown" class="zd-linear-team-dropdown" style="display: none;"></div>
                    </div>
                </div>

                <!-- Status Dropdown -->
                <div class="zd-linear-filter-group">
                    <label class="zd-linear-filter-label">Status</label>
                    <select id="zd-linear-status-select" class="zd-linear-status-select" disabled>
                        <option value="">All statuses</option>
                    </select>
                </div>

                <!-- Search Input -->
                <div class="zd-linear-filter-group">
                    <label class="zd-linear-filter-label">Search</label>
                    <input
                        type="text"
                        id="zd-linear-search-input"
                        class="zd-linear-search-input"
                        placeholder="Search issues..."
                        autocomplete="off"
                    />
                </div>

                <!-- Search Button -->
                <div class="zd-linear-filter-group">
                    <button id="zd-linear-search-btn" class="zd-linear-search-btn" disabled>Search</button>
                </div>
            </div>

            <div class="zd-linear-results-container">
                <div class="zd-linear-empty-state">
                    <div class="zd-linear-empty-icon">${window.ZDIcons ? window.ZDIcons.getIconHTML('linear', 48) : '⚡'}</div>
                    <div class="zd-linear-empty-text">Search for Linear issues</div>
                    <div class="zd-linear-empty-hint">Select a team to get started</div>
                </div>
            </div>
        `;

        document.body.appendChild(panel);
        linearPanelEl = panel;

        // Set up event listeners
        setupEventListeners();

        return panel;
    }

    /**
     * Setup event listeners for the panel
     */
    function setupEventListeners() {
        if (!linearPanelEl) return;

        const keywordBtn = linearPanelEl.querySelector('#zd-linear-keyword-btn');
        const teamInput = linearPanelEl.querySelector('#zd-linear-team-input');
        const teamDropdown = linearPanelEl.querySelector('#zd-linear-team-dropdown');
        const statusSelect = linearPanelEl.querySelector('#zd-linear-status-select');
        const searchInput = linearPanelEl.querySelector('#zd-linear-search-input');
        const searchBtn = linearPanelEl.querySelector('#zd-linear-search-btn');
        const closeBtn = linearPanelEl.querySelector('.zd-linear-close-btn');

        // Keyword extraction button
        keywordBtn.addEventListener('click', extractAndShowKeywords);

        // Team input focus - show dropdown and select all text
        teamInput.addEventListener('focus', () => {
            if (allTeams.length > 0) {
                showTeamDropdown = true;
                // Select all text so user can immediately type to replace
                teamInput.select();
                // Show all teams in dropdown (ignore current value)
                updateTeamDropdown('');
            }
        });

        // Team input - filter teams
        teamInput.addEventListener('input', (e) => {
            showTeamDropdown = true;
            updateTeamDropdown(e.target.value);
        });

        // Search button
        searchBtn.addEventListener('click', performSearch);

        // Enter key in search input
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !searchBtn.disabled) {
                performSearch();
            }
        });

        // Close button
        closeBtn.addEventListener('click', () => {
            toggleLinearPanel();
        });

        // Click outside to close dropdown
        document.addEventListener('click', (e) => {
            if (!linearPanelEl.contains(e.target)) {
                hideTeamDropdown();
            }
        });
    }

    /**
     * Update team dropdown with filtered teams
     */
    function updateTeamDropdown(searchTerm) {
        if (!linearPanelEl) return;

        const teamDropdown = linearPanelEl.querySelector('#zd-linear-team-dropdown');
        const lowerSearch = searchTerm.toLowerCase();

        const filteredTeams = allTeams.filter(team =>
            team.name.toLowerCase().includes(lowerSearch) ||
            team.key.toLowerCase().includes(lowerSearch)
        );

        // Start with "All Teams" option
        let dropdownHTML = `
            <div class="zd-linear-team-dropdown-item zd-linear-all-teams-item" data-team-id="ALL_TEAMS">
                <span class="zd-linear-team-key" style="background: var(--zd-accent-blue);">ALL</span>
                <span class="zd-linear-team-name">All Teams</span>
            </div>
        `;

        if (filteredTeams.length === 0 && searchTerm.trim() !== '') {
            dropdownHTML += '<div class="zd-linear-team-dropdown-item zd-linear-team-dropdown-empty">No teams found</div>';
        } else {
            // Add filtered teams
            dropdownHTML += filteredTeams.slice(0, 50).map(team => `
                <div class="zd-linear-team-dropdown-item" data-team-id="${team.id}" data-team-key="${team.key}" data-team-name="${team.name}">
                    <span class="zd-linear-team-key">[${team.key}]</span>
                    <span class="zd-linear-team-name">${team.name}</span>
                </div>
            `).join('');
        }

        teamDropdown.innerHTML = dropdownHTML;

        // Add click handlers
        teamDropdown.querySelectorAll('.zd-linear-team-dropdown-item:not(.zd-linear-team-dropdown-empty)').forEach(item => {
            item.addEventListener('click', () => {
                const teamId = item.dataset.teamId;
                const teamKey = item.dataset.teamKey;
                const teamName = item.dataset.teamName;

                if (teamId === 'ALL_TEAMS') {
                    handleAllTeamsSelect();
                } else {
                    handleTeamSelect({ id: teamId, key: teamKey, name: teamName });
                }
            });
        });

        if (showTeamDropdown) {
            teamDropdown.style.display = 'block';
        }
    }

    /**
     * Hide team dropdown
     */
    function hideTeamDropdown() {
        if (!linearPanelEl) return;
        const teamDropdown = linearPanelEl.querySelector('#zd-linear-team-dropdown');
        if (teamDropdown) {
            teamDropdown.style.display = 'none';
            showTeamDropdown = false;
        }
    }

    /**
     * Handle "All Teams" selection
     */
    function handleAllTeamsSelect() {
        selectedTeam = null;

        const teamInput = linearPanelEl.querySelector('#zd-linear-team-input');
        const statusSelect = linearPanelEl.querySelector('#zd-linear-status-select');
        const searchBtn = linearPanelEl.querySelector('#zd-linear-search-btn');

        // Update team input
        teamInput.value = 'All Teams';

        // Hide dropdown
        hideTeamDropdown();

        // Enable search button
        searchBtn.disabled = false;

        // Clear and disable status dropdown (status filter is team-specific)
        workflowStates = [];
        statusSelect.innerHTML = '<option value="">All statuses</option>';
        statusSelect.disabled = true;

        // Clear results
        showEmptyState('Enter search terms and click Search');
    }

    /**
     * Handle team selection
     */
    async function handleTeamSelect(team) {
        selectedTeam = team;

        const teamInput = linearPanelEl.querySelector('#zd-linear-team-input');
        const statusSelect = linearPanelEl.querySelector('#zd-linear-status-select');
        const searchBtn = linearPanelEl.querySelector('#zd-linear-search-btn');

        // Update team input
        teamInput.value = `[${team.key}] ${team.name}`;

        // Hide dropdown
        hideTeamDropdown();

        // Enable search button
        searchBtn.disabled = false;

        // Clear results
        showEmptyState('Select filters and click Search');

        // Load workflow states
        try {
            const cfg = await window.ZDStorage.getConfig();
            const apiKey = cfg.linearApiKey || '';

            if (!apiKey) return;

            workflowStates = await window.ZDLinear.getWorkflowStates(team.key, apiKey);

            // Populate status dropdown
            statusSelect.innerHTML = '<option value="">All statuses</option>';
            workflowStates.forEach(state => {
                const option = document.createElement('option');
                option.value = state.id;
                option.textContent = state.name;
                statusSelect.appendChild(option);
            });

            // Enable status dropdown
            statusSelect.disabled = false;
        } catch (error) {
            console.error('[Linear Panel] Failed to load workflow states:', error);
            showErrorState(error.message);
        }
    }

    /**
     * Perform search
     */
    async function performSearch() {
        const searchInput = linearPanelEl.querySelector('#zd-linear-search-input');
        const statusSelect = linearPanelEl.querySelector('#zd-linear-status-select');

        const searchTerm = searchInput.value.trim();
        const stateId = statusSelect.value;

        showLoadingState();

        try {
            const cfg = await window.ZDStorage.getConfig();
            const apiKey = cfg.linearApiKey || '';

            if (!apiKey) {
                showErrorState('Linear API key not configured');
                return;
            }

            let results;
            if (selectedTeam) {
                // Search specific team
                results = await window.ZDLinear.searchIssues({
                    teamKey: selectedTeam.key,
                    search: searchTerm || undefined,
                    stateId: stateId || undefined
                }, apiKey);
            } else {
                // Search all teams
                results = await window.ZDLinear.searchAllTeams({
                    search: searchTerm || undefined,
                    stateId: stateId || undefined
                }, apiKey);
            }

            displayResults(results);
        } catch (error) {
            console.error('[Linear Panel] Search failed:', error);
            showErrorState(error.message);
        }
    }

    /**
     * Perform AI-powered search based on current ticket
     *
     * This is the main function for the "Find Similar Issues" feature. It:
     * 1. Extracts the full conversation from the current Zendesk ticket
     * 2. Sends it to Google Gemini AI via background.js
     * 3. AI analyzes the conversation and extracts feature names
     * 4. Searches Linear with AI-generated terms
     * 5. Displays results with AI context (what was searched and why)
     *
     * LOADING STATE MANAGEMENT:
     * While the search is running, all controls are disabled to prevent
     * user confusion (e.g., clicking "Search" while AI search is in progress).
     * The button text changes to "Searching..." for clear feedback.
     *
     * ERROR HANDLING:
     * All errors are caught and shown in the results area. Controls are
     * re-enabled so the user can try again or use manual search.
     *
     * FALLBACK BEHAVIOR:
     * If AI API key is not configured, the background script automatically
     * falls back to simple keyword extraction (still better than nothing).
     */

    /**
     * Extract keywords from ticket conversation
     *
     * Privacy-first approach: All processing happens locally in the browser.
     * No data is sent to external APIs.
     *
     * This function extracts the most relevant keywords from the ticket to help users
     * quickly search Linear. Keywords are extracted based on:
     * - Frequency (how often they appear)
     * - Technical relevance (capitalized words, product names)
     * - Filtering out common words (stopwords)
     *
     * @param {string} text - The text to extract keywords from
     * @returns {string[]} Array of 5-8 keywords sorted by relevance
     */
    function extractKeywordsFromText(text) {
        // STEP 1: Remove all URLs and domains from text BEFORE processing
        // This prevents domain names from being extracted as keywords
        let cleanedText = text;

        // Remove full URLs (http://example.com, https://example.com/path)
        cleanedText = cleanedText.replace(/https?:\/\/[^\s]+/gi, ' ');

        // Remove domain patterns (example.com, subdomain.example.com)
        cleanedText = cleanedText.replace(/\b[\w-]+\.(?:com|net|org|io|co|app|blog|site|online|dev|tech|ai|jp|uk|ca|au|de|fr|es|it|info|biz|me|tv|cc)\b[^\s]*/gi, ' ');

        // Remove email addresses
        cleanedText = cleanedText.replace(/\b[\w.-]+@[\w.-]+\.\w+/gi, ' ');

        // Remove words that look like concatenated domains (moliereexpressionsdotcom, exampledotcom)
        cleanedText = cleanedText.replace(/\b\w*dot(?:com|net|org|io|co)\w*\b/gi, ' ');

        // COMPREHENSIVE STOPWORDS - Expanded to be much more aggressive
        // These are common words that don't help with search
        const stopwords = new Set([
            // Articles & demonstratives
            'the', 'a', 'an', 'this', 'that', 'these', 'those',
            // Prepositions
            'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about', 'into',
            'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'over',
            // Conjunctions
            'and', 'or', 'but', 'nor', 'yet', 'so', 'if', 'then', 'because', 'while', 'although',
            // Pronouns
            'i', 'you', 'he', 'she', 'it', 'we', 'they', 'them', 'their', 'my', 'your', 'our',
            'me', 'him', 'her', 'us', 'myself', 'yourself', 'himself', 'herself', 'itself',
            // Verbs (common)
            'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
            'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'get', 'got',
            'make', 'made', 'go', 'going', 'gone', 'come', 'came', 'see', 'saw', 'look', 'looking',
            'know', 'find', 'use', 'using', 'used', 'give', 'take', 'work', 'works', 'working',
            'keep', 'kept', 'let', 'put', 'seem', 'seems', 'tell', 'ask', 'asked', 'show', 'try',
            'connect', 'connecting', 'connected', 'connection',
            'lose', 'lost', 'losing', 'stop', 'stops', 'stopped', 'stopping',
            'revert', 'reverts', 'reverting', 'drop', 'drops', 'dropped', 'dropping',
            'allow', 'allows', 'allowing', 'allowed', 'provide', 'provides', 'providing', 'provided',
            'check', 'checks', 'checking', 'checked', 'follow', 'follows', 'following', 'followed',
            'hear', 'heard', 'hearing', 'move', 'moves', 'moving', 'moved',
            'happen', 'happens', 'happened', 'happening', 'join', 'joined', 'joining',
            'appear', 'appears', 'appeared', 'appearing', 'reach', 'reached', 'reaching',
            'share', 'shared', 'sharing', 'wait', 'waiting', 'waited',
            'understand', 'understanding', 'understands', 'understood',
            'explain', 'explains', 'explaining', 'explained',
            // Support-specific stopwords
            'user', 'customer', 'help', 'issue', 'problem', 'question', 'ticket', 'request',
            'need', 'needs', 'want', 'wants', 'having', 'getting', 'trying', 'able', 'unable',
            'hi', 'hello', 'hey', 'thanks', 'thank', 'please', 'yes', 'no', 'okay', 'ok', 'sure',
            'bot', 'agent', 'end-user', 'support', 'zendesk', 'linear', 'app',
            'happiness', 'engineer', 'team', 'assist', 'assistance', 'assisted', // Support team references
            'sorry', 'apology', 'apologize', 'appreciate', 'appreciated', 'appreciating', // Polite phrases
            'worry', 'patience', 'patient', 'prompting', 'proceed', 'primary', // Support conversation words
            'choice', 'choose', 'chosen', 'choosing', 'consider', 'considering', 'considered',
            'longer', 'usual', 'minute', 'minutes', 'hour', 'hours',
            // Website/domain-related (not relevant for feature search)
            'website', 'site', 'blog', 'url', 'link', 'domain', 'address', 'web', 'online',
            'host', 'hosting', 'server', 'subdomain', 'homepage', 'webpage',
            // Generic business/product terms
            'free', 'paid', 'premium', 'basic', 'plan', 'plans', 'personal', 'business', 'enterprise',
            'new', 'old', 'current', 'previous', 'next', 'first', 'last', 'now', 'here', 'there',
            'thing', 'things', 'something', 'anything', 'everything', 'nothing', 'way', 'ways',
            'time', 'times', 'page', 'pages', 'link', 'links', 'button', 'buttons', 'click', 'clicking',
            // Interrogatives and connectors
            'what', 'when', 'where', 'why', 'how', 'who', 'which', 'whose', 'whom',
            'instead', 'however', 'therefore', 'thus', 'hence', 'moreover', 'furthermore',
            // Generic adjectives and adverbs
            'user-friendly', 'same', 'different', 'good', 'bad', 'better', 'best', 'worse', 'worst',
            'also', 'just', 'really', 'very', 'too', 'quite', 'rather', 'pretty', 'kind', 'sort',
            'sometimes', 'usually', 'always', 'never', 'often', 'maybe', 'probably', 'actually',
            'advanced', 'basic', 'simple', 'easy', 'difficult', 'hard', 'quick', 'fast', 'slow',
            'able', 'unable', 'available', 'unavailable', 'possible', 'impossible',
            'little', 'much', 'many', 'few', 'several', 'enough', 'more', 'most', 'less', 'least',
            'specific', 'general', 'particular', 'certain', 'related', 'relevant',
            // Meta/system words
            'transcript', 'summary', 'internal-note', 'conversation', 'message', 'chat', 'email',
            'appearance', 'option', 'options', 'setting', 'settings', 'section', 'tab', 'menu',
            // Generic verbs
            'add', 'added', 'adding', 'remove', 'removing', 'delete', 'change', 'changing', 'edit',
            // Generic nouns that need context
            'back', 'front', 'additional', 'custom', 'content', 'text', 'feature', 'features',
            'access', 'guidance', 'detail', 'details', 'case', 'cases', 'bit', 'bits',
            'impact', 'impacts', 'change', 'changes', 'experience', 'decision',
            'reason', 'reasons', 'chance', 'opportunity', 'situation', 'information',
            'data', 'result', 'results', 'process', 'step', 'steps',
            'action', 'actions', 'taken', 'point', 'points', 'example', 'examples',
            // User-specific info (not relevant for Linear search)
            'site-name', 'site-url', 'email', 'emails', 'username', 'user-id',
            // Product names that are too generic
            'wordpress', 'wp',
            // Numbers and dates (when standalone)
            'one', 'two', 'three', 'four', 'five', 'today', 'yesterday', 'tomorrow', 'day', 'week',
            'month', 'year', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
            // URLs and technical noise (removed css from here - it's actually relevant!)
            'http', 'https', 'www', 'com', 'net', 'org', 'html', 'js', 'php'
        ]);

        // WORDPRESS/TECHNICAL TERMS - Words that are highly relevant for Linear search
        const technicalTerms = new Set([
            // Core WordPress concepts
            'theme', 'themes', 'plugin', 'plugins', 'widget', 'widgets',
            // Design/layout
            'css', 'javascript', 'stylesheet', 'style', 'styles',
            'sidebar', 'header', 'footer', 'navigation', 'menu',
            'margin', 'padding', 'spacing', 'layout', 'template', 'customizer',
            // Features
            'tagline', 'subscribe', 'subscription', 'editor', 'block', 'blocks',
            // Products
            'jetpack', 'woocommerce', 'elementor', 'gutenberg',
            // Technical (removed 'domain', 'hosting' - too generic/website-related)
            'database', 'admin', 'dashboard', 'api'
        ]);

        // WORD EXTRACTION from cleaned text (URLs/domains already removed)
        const words = cleanedText
            .toLowerCase()
            .replace(/[^\w\s-]/g, ' ')  // Keep alphanumeric, spaces, hyphens
            .split(/\s+/)
            .filter(word => {
                if (!word) return false;
                if (word.length < 3) return false;
                if (stopwords.has(word)) return false;
                if (/^\d+$/.test(word)) return false;  // Just numbers

                // Filter very long words (likely IDs or concatenated strings)
                if (word.length > 25) return false;

                // Filter long hyphenated identifiers (site names, user IDs)
                // BUT keep technical terms like "cookie-consent", "user-interface"
                if (word.includes('-') && word.length > 15 && !technicalTerms.has(word)) return false;

                // Filter words with numbers mixed in (likely IDs or versions)
                if (/\d/.test(word) && !/^(css\d+|html\d+)$/i.test(word)) return false;

                // Filter remaining domain-like patterns that slipped through
                if (word.includes('.')) return false;

                return true;
            });

        // FREQUENCY COUNTING
        const wordCount = {};
        for (const word of words) {
            wordCount[word] = (wordCount[word] || 0) + 1;
        }

        // SMART SCORING: Frequency + Technical Relevance
        const totalWords = words.length;
        const scores = {};

        for (const [word, count] of Object.entries(wordCount)) {
            let score = 0;

            // PRIORITY 1: Technical WordPress/web terms get HUGE boost
            if (technicalTerms.has(word)) {
                score = count * 50;  // Multiply frequency by 50!
                // "css" appearing 10 times = score of 500
            }
            // PRIORITY 2: Specific names (theme names, site names) - Usually longer, unique words
            // These appear a few times and are specific identifiers
            else if (count >= 2 && count <= 8 && word.length >= 6) {
                score = count * 30;  // High score for specific identifiers
                // "retrospect" appearing 3 times = score of 90
            }
            // PRIORITY 3: Words that appear multiple times (the actual topic)
            else if (count >= 3 && count <= 15) {
                score = count * 10;  // Solid frequency = important
            }
            // PRIORITY 4: Words appearing 2 times
            else if (count === 2) {
                score = 15;
            }
            // PRIORITY 5: Rare words (might be specific but less confirmed)
            else if (count === 1) {
                score = 5;
            }
            // Too common (appears in almost every message)
            else {
                score = 2;
            }

            // BONUS: Capitalized in original text (product names like "Goran", "WordPress")
            const capitalPattern = new RegExp(`\\b${word.charAt(0).toUpperCase()}${word.slice(1)}\\b`, 'i');
            if (capitalPattern.test(text)) {
                score *= 1.5;
            }

            // BONUS: Longer, more specific words
            if (word.length > 8) {
                score *= 1.3;
            }

            // BONUS: Hyphenated words that aren't in stopwords (feature names like "cookie-consent")
            // But NOT generic ones like "user-friendly" (already in stopwords)
            if (word.includes('-') && word.length > 6 && !stopwords.has(word)) {
                score *= 2;
            }

            scores[word] = score;
        }

        // SORTING & LIMITING
        const sortedKeywords = Object.entries(scores)
            .filter(([word, score]) => score >= 10)  // Higher threshold - only quality keywords
            .sort((a, b) => b[1] - a[1])
            .map(([word]) => word)
            .slice(0, 8);

        return sortedKeywords;
    }

    /**
     * Extract keywords and display them as clickable chips
     *
     * This function:
     * 1. Extracts the ticket conversation using ZDTranscript
     * 2. Extracts keywords locally (no API calls)
     * 3. Shows them as clickable chips below the button
     * 4. Each chip searches Linear when clicked
     */
    function extractAndShowKeywords() {
        console.log('[Linear Panel] Extracting keywords from ticket');

        const keywordBtn = linearPanelEl.querySelector('#zd-linear-keyword-btn');
        const keywordChipsContainer = linearPanelEl.querySelector('#zd-linear-keyword-chips');

        // Check if ZDTranscript is available
        if (!window.ZDTranscript) {
            showErrorState('Transcript extraction not available. Please refresh the page.');
            return;
        }

        // Change button text to show we're working
        const originalText = keywordBtn.textContent;
        keywordBtn.disabled = true;
        keywordBtn.textContent = 'Extracting...';

        try {
            // Extract transcript from current ticket
            const transcriptData = window.ZDTranscript.extractTranscript();

            if (!transcriptData.success) {
                showErrorState(transcriptData.error || 'Failed to extract ticket conversation');
                keywordBtn.disabled = false;
                keywordBtn.textContent = originalText;
                return;
            }

            const { title, transcript } = transcriptData;

            // Extract keywords from transcript ONLY (title usually has no relevant context)
            const keywords = extractKeywordsFromText(transcript);

            console.log('[Linear Panel] Extracted keywords:', keywords);

            if (keywords.length === 0) {
                keywordChipsContainer.innerHTML = '<div class="zd-linear-keyword-empty">No keywords found in this ticket</div>';
                keywordChipsContainer.style.display = 'block';
                keywordBtn.disabled = false;
                keywordBtn.textContent = originalText;
                return;
            }

            // Create clickable chips
            const chipsHTML = keywords.map(keyword => {
                return `<button class="zd-linear-keyword-chip" data-keyword="${keyword}">${keyword}</button>`;
            }).join('');

            keywordChipsContainer.innerHTML = chipsHTML;
            keywordChipsContainer.style.display = 'flex';

            // Add click handlers to chips
            keywordChipsContainer.querySelectorAll('.zd-linear-keyword-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    const keyword = chip.dataset.keyword;
                    searchWithKeyword(keyword);
                });
            });

            // Re-enable button
            keywordBtn.disabled = false;
            keywordBtn.textContent = originalText;

        } catch (error) {
            console.error('[Linear Panel] Keyword extraction failed:', error);
            showErrorState('Failed to extract keywords: ' + error.message);
            keywordBtn.disabled = false;
            keywordBtn.textContent = originalText;
        }
    }

    /**
     * Search Linear with a specific keyword
     *
     * When user clicks a keyword chip, this function:
     * 1. Fills the search input with the keyword
     * 2. Searches all teams for that keyword
     * 3. Displays results
     */
    async function searchWithKeyword(keyword) {
        console.log('[Linear Panel] Searching with keyword:', keyword);

        const searchInput = linearPanelEl.querySelector('#zd-linear-search-input');

        // Fill search input so user can see what we're searching for
        searchInput.value = keyword;

        // Show loading state
        showLoadingState(`Searching for "${keyword}"...`);

        try {
            const cfg = await window.ZDStorage.getConfig();
            const apiKey = cfg.linearApiKey || '';

            if (!apiKey) {
                showErrorState('Linear API key not configured');
                return;
            }

            // Search all teams (not limited to selected team)
            const results = await window.ZDLinear.searchAllTeams({
                search: keyword,
                stateId: undefined
            }, apiKey);

            // Display results
            displayResults(results);

        } catch (error) {
            console.error('[Linear Panel] Search failed:', error);
            showErrorState(error.message);
        }
    }

    /**
     * Show empty state
     */
    function showEmptyState(hint = 'Select a team to get started') {
        if (!linearPanelEl) return;

        const resultsContainer = linearPanelEl.querySelector('.zd-linear-results-container');
        resultsContainer.innerHTML = `
            <div class="zd-linear-empty-state">
                <div class="zd-linear-empty-icon">${window.ZDIcons ? window.ZDIcons.getIconHTML('linear', 48) : '⚡'}</div>
                <div class="zd-linear-empty-text">Search for Linear issues</div>
                <div class="zd-linear-empty-hint">${hint}</div>
            </div>
        `;
    }

    /**
     * Show loading state
     */
    function showLoadingState(message = 'Searching...') {
        if (!linearPanelEl) return;

        const resultsContainer = linearPanelEl.querySelector('.zd-linear-results-container');
        resultsContainer.innerHTML = `
            <div class="zd-linear-loading">
                <div class="zd-linear-loading-spinner"></div>
                <div class="zd-linear-loading-text">${message}</div>
            </div>
        `;
    }

    /**
     * Show error state
     */
    function showErrorState(errorMessage) {
        if (!linearPanelEl) return;

        const resultsContainer = linearPanelEl.querySelector('.zd-linear-results-container');
        resultsContainer.innerHTML = `
            <div class="zd-linear-error-state">
                <div class="zd-linear-error-icon">⚠️</div>
                <div class="zd-linear-error-text">Error</div>
                <div class="zd-linear-error-message">${errorMessage}</div>
            </div>
        `;
    }

    /**
     * Display search results
     *
     * @param {Array} results - Array of Linear issues from ZDLinear.searchIssues()
     */
    function displayResults(results) {
        if (!linearPanelEl) return;

        const resultsContainer = linearPanelEl.querySelector('.zd-linear-results-container');

        if (!results || results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="zd-linear-empty-state">
                    <div class="zd-linear-empty-icon">🔍</div>
                    <div class="zd-linear-empty-text">No issues found</div>
                    <div class="zd-linear-empty-hint">Try different filters or search terms</div>
                </div>
            `;
            return;
        }

        // Build results HTML
        const resultsHTML = results.map(issue => {
            const statusName = issue.state?.name || 'Unknown';
            const priorityLabel = window.ZDLinear?.formatPriority(issue.priority, issue.priorityLabel) || 'No priority';
            const assigneeName = issue.assignee?.name || 'Unassigned';
            const updatedDate = window.ZDLinear?.formatDate(issue.updatedAt) || '';
            const teamName = issue.team?.name || '';

            return `
                <div class="zd-linear-issue-card" data-url="${issue.url}">
                    <div class="zd-linear-issue-header">
                        <div class="zd-linear-issue-identifier">${issue.identifier}</div>
                        <div class="zd-linear-issue-team">${teamName}</div>
                    </div>
                    <div class="zd-linear-issue-title">${issue.title}</div>
                    ${issue.description ? `<div class="zd-linear-issue-description">${truncateText(issue.description, 100)}</div>` : ''}
                    <div class="zd-linear-issue-footer">
                        <div class="zd-linear-issue-meta">
                            <span class="zd-linear-status-badge">
                                ${statusName}
                            </span>
                            <span class="zd-linear-priority-badge">${priorityLabel}</span>
                        </div>
                        <div class="zd-linear-issue-info">
                            <span class="zd-linear-assignee">${assigneeName}</span>
                            <span class="zd-linear-date">${updatedDate}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        resultsContainer.innerHTML = resultsHTML;

        // Add click handlers to cards
        resultsContainer.querySelectorAll('.zd-linear-issue-card').forEach(card => {
            card.addEventListener('click', () => {
                const url = card.dataset.url;
                if (url) {
                    window.open(url, '_blank', 'noopener,noreferrer');
                }
            });
        });
    }

    /**
     * Truncate text with ellipsis
     */
    function truncateText(text, maxLength) {
        if (!text) return '';

        // Remove markdown formatting
        const cleanText = text.replace(/[#*_`\[\]]/g, '');

        if (cleanText.length <= maxLength) {
            return cleanText;
        }

        return cleanText.substring(0, maxLength) + '...';
    }

    /**
     * Load teams into memory
     */
    async function loadTeams() {
        try {
            const cfg = await window.ZDStorage.getConfig();
            const apiKey = cfg.linearApiKey || '';

            if (!apiKey) return;

            allTeams = await window.ZDLinear.getTeams(apiKey);

            // Enable search button once teams are loaded (allows searching all teams)
            const searchBtn = linearPanelEl?.querySelector('#zd-linear-search-btn');
            if (searchBtn) {
                searchBtn.disabled = false;
            }
        } catch (error) {
            console.error('[Linear Panel] Failed to load teams:', error);
        }
    }

    /**
     * Toggle Linear panel visibility
     *
     * Opens or closes the Linear search panel. On first open, checks if Linear
     * API key is configured and shows setup modal if not.
     *
     * DEFAULT BEHAVIOR - "All Teams":
     * When the panel opens, it defaults to "All Teams" instead of forcing the user
     * to select a specific team. This improves UX because:
     * 1. AI search works better across all teams (finds more similar issues)
     * 2. User doesn't have to pick a team before searching
     * 3. No auto-focus on team input means the dropdown doesn't auto-show and block interaction
     *
     * The user can still click the team input to filter by a specific team if desired.
     * When they click the input, the text auto-selects so they can immediately type to search.
     */
    async function toggleLinearPanel() {
        // STEP 1: CHECK LINEAR API KEY CONFIGURATION
        // If no Linear API key is configured, show the setup modal instead of the panel
        const cfg = await window.ZDStorage.getConfig();

        if (!cfg.linearApiKey || cfg.linearApiKey.trim() === '') {
            showLinearSetupModal();
            return;
        }

        // STEP 2: CREATE PANEL IF FIRST TIME
        // Panel is created lazily (only when first opened, not on page load)
        if (!linearPanelEl) {
            createLinearPanel();
        }

        // STEP 3: TOGGLE VISIBILITY
        isLinearPanelVisible = !isLinearPanelVisible;

        if (isLinearPanelVisible) {
            linearPanelEl.style.display = 'flex';

            // Load teams from Linear API
            await loadTeams();

            // DEFAULT TO "ALL TEAMS"
            // This is a key UX decision: instead of forcing the user to select a team,
            // we default to "All Teams" so they can immediately search or use AI search.
            selectedTeam = null;  // null = search all teams
            const teamInput = linearPanelEl.querySelector('#zd-linear-team-input');
            const searchBtn = linearPanelEl.querySelector('#zd-linear-search-btn');

            if (teamInput) {
                teamInput.value = 'All Teams';  // Display text
            }

            // Enable search button immediately (don't wait for team selection)
            if (searchBtn) {
                searchBtn.disabled = false;
            }

            // DON'T AUTO-FOCUS THE INPUT
            // Previously we auto-focused the team input, which forced the dropdown open
            // and blocked other interactions. Now we let the user click if they want
            // to change the team selection.
        } else {
            // Hide panel and clean up
            linearPanelEl.style.display = 'none';
            hideTeamDropdown();
        }
    }

    /**
     * Close Linear panel
     */
    function closeLinearPanel() {
        if (linearPanelEl) {
            linearPanelEl.style.display = 'none';
            isLinearPanelVisible = false;
            hideTeamDropdown();
        }
    }

    /**
     * Check if Linear panel is visible
     */
    function isLinearPanelOpen() {
        return isLinearPanelVisible;
    }

    // Export to global scope
    window.ZDLinearPanel = {
        toggleLinearPanel,
        closeLinearPanel,
        isLinearPanelOpen,
        showLinearSetupModal
    };

})();
