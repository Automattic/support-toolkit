// LINEAR SEARCH PANEL UI COMPONENT
// ===================================
// This module provides a right-side panel for searching Linear issues directly from Zendesk.
//
// KEY FEATURES:
// 1. **AI-Powered Search** - "Find Similar Issues" button that:
//    - Extracts the current ticket conversation using transcript.js
//    - Sends it to Google Gemini AI to understand the context
//    - AI identifies the feature/component being discussed (e.g., "Cookie Consent")
//    - Automatically searches Linear with smart terms
//    - Shows results with AI context banner
//
// 2. **Manual Search** - Traditional search with:
//    - Team filtering (or "All Teams" to search everything)
//    - Status filtering (In Progress, Done, etc.)
//    - Free-text search
//
// 3. **Autocomplete Team Dropdown** - Type to filter teams, shows team keys
//
// 4. **Click-to-Open** - Clicking any result opens the Linear issue in a new tab
//
// ARCHITECTURE:
// - IIFE pattern for private scope
// - Global exports on window.ZDLinearPanel
// - Communicates with background.js for AI API calls (Manifest V3 requirement)
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
                <!-- AI Search Button -->
                <div class="zd-linear-ai-search-section">
                    <button id="zd-linear-ai-search-btn" class="zd-linear-ai-search-btn" title="Use AI to search for similar issues based on this ticket">
                        Find Similar Issues
                    </button>
                </div>

                <div class="zd-linear-filters-divider">
                    <span>OR</span>
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

        const aiSearchBtn = linearPanelEl.querySelector('#zd-linear-ai-search-btn');
        const teamInput = linearPanelEl.querySelector('#zd-linear-team-input');
        const teamDropdown = linearPanelEl.querySelector('#zd-linear-team-dropdown');
        const statusSelect = linearPanelEl.querySelector('#zd-linear-status-select');
        const searchInput = linearPanelEl.querySelector('#zd-linear-search-input');
        const searchBtn = linearPanelEl.querySelector('#zd-linear-search-btn');
        const closeBtn = linearPanelEl.querySelector('.zd-linear-close-btn');

        // AI Search button
        aiSearchBtn.addEventListener('click', performAISearch);

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
    async function performAISearch() {
        console.log('[Linear Panel] AI Search started');

        // Get references to all UI controls
        const aiSearchBtn = linearPanelEl.querySelector('#zd-linear-ai-search-btn');
        const teamInput = linearPanelEl.querySelector('#zd-linear-team-input');
        const statusSelect = linearPanelEl.querySelector('#zd-linear-status-select');
        const searchInput = linearPanelEl.querySelector('#zd-linear-search-input');
        const searchBtn = linearPanelEl.querySelector('#zd-linear-search-btn');

        // Store original button text so we can restore it later
        const originalButtonText = aiSearchBtn.textContent;
        console.log('[Linear Panel] Original button text:', originalButtonText);

        /**
         * Re-enable all controls after search completes (success or error)
         *
         * This helper function is called in multiple places (success, error, etc.)
         * to ensure controls are always re-enabled and the UI isn't left in a disabled state.
         */
        const enableControls = () => {
            aiSearchBtn.disabled = false;
            aiSearchBtn.textContent = originalButtonText;
            teamInput.disabled = false;
            searchInput.disabled = false;

            // Only enable search button if teams are loaded
            // (search button is disabled on initial load until we know what teams exist)
            if (selectedTeam || allTeams.length > 0) {
                searchBtn.disabled = false;
            }

            // Re-enable status dropdown only if workflow states are loaded for selected team
            // (status dropdown is team-specific, so it's disabled when "All Teams" is selected)
            if (workflowStates.length > 0) {
                statusSelect.disabled = false;
            }
        };

        try {
            // STEP 1: DISABLE ALL CONTROLS
            // Lock the UI to prevent user from clicking other buttons while AI search is running.
            // This creates a clear loading state and prevents confusion.
            aiSearchBtn.disabled = true;
            aiSearchBtn.textContent = 'Searching...';  // Visual feedback
            teamInput.disabled = true;
            statusSelect.disabled = true;
            searchInput.disabled = true;
            searchBtn.disabled = true;

            // STEP 2: CHECK DEPENDENCIES
            // ZDTranscript module should be loaded via manifest.json, but we check
            // to be safe. If it's missing, the extension might not have loaded correctly.
            if (!window.ZDTranscript) {
                showErrorState('Transcript extraction not available. Please refresh the page.');
                enableControls();
                return;
            }

            showLoadingState('Analyzing ticket...');

            // STEP 3: EXTRACT CONVERSATION FROM ZENDESK TICKET
            // This calls transcript.js to scrape the DOM and get all messages
            // from bots, agents, and end-users in the current ticket.
            console.log('[Linear Panel] Extracting transcript...');
            const transcriptData = window.ZDTranscript.extractTranscript();
            console.log('[Linear Panel] Transcript data:', transcriptData);

            // Validate transcript extraction succeeded
            if (!transcriptData.success) {
                console.error('[Linear Panel] Transcript extraction failed:', transcriptData.error);
                showErrorState(transcriptData.error || 'Failed to extract ticket transcript');
                enableControls();
                return;
            }

            const { title, transcript } = transcriptData;
            console.log('[Linear Panel] Extracted title:', title);
            console.log('[Linear Panel] Extracted transcript length:', transcript.length);

            // STEP 4: GET API KEYS FROM CHROME STORAGE
            // We need two keys:
            // - linearApiKey: Required for searching Linear (if missing, we can't continue)
            // - aiApiKey: Optional for Google Gemini (if missing, background.js falls back to keywords)
            const cfg = await window.ZDStorage.getConfig();
            const linearApiKey = cfg.linearApiKey || '';
            const aiApiKey = cfg.aiApiKey || '';
            console.log('[Linear Panel] Linear API key present:', !!linearApiKey);
            console.log('[Linear Panel] AI API key present:', !!aiApiKey);

            if (!linearApiKey) {
                showErrorState('Linear API key not configured');
                enableControls();
                return;
            }

            // STEP 5: SEND TO BACKGROUND SCRIPT FOR AI ANALYSIS
            // Why background script? Chrome Extension Manifest V3 requires that all
            // external API calls (like Gemini) happen in the background service worker,
            // not in content scripts. So we send a message to background.js.
            //
            // The background script will:
            // 1. Send transcript to Google Gemini AI
            // 2. AI extracts feature names (e.g., "Cookie Consent")
            // 3. Returns { searchQuery: "...", summary: "..." }
            // 4. OR falls back to keyword extraction if AI fails/not configured
            showLoadingState('Analyzing conversation...');
            console.log('[Linear Panel] Sending message to background script...');

            // Send message using Chrome Extension message passing API
            chrome.runtime.sendMessage({
                type: 'AI_LINEAR_SEARCH',
                title: title,
                transcript: transcript,
                apiKey: aiApiKey // Will use AI if available, otherwise falls back to keywords
            }, async (response) => {
                // STEP 6: HANDLE RESPONSE FROM BACKGROUND SCRIPT
                // The background script has completed AI analysis and returned search terms
                console.log('[Linear Panel] Received response from background:', response);

                if (!response.success) {
                    // AI analysis failed completely (e.g., network error, invalid API key)
                    showErrorState(response.error || 'AI search failed');
                    enableControls();
                    return;
                }

                // Extract AI-generated search query and summary
                const { searchQuery, summary } = response.searchTerms;
                console.log('[Linear Panel] AI generated search query:', searchQuery);
                console.log('[Linear Panel] AI summary:', summary);

                // Update loading message to show what we're searching for
                showLoadingState(`Searching Linear for: "${searchQuery}"`);

                // STEP 7: SEARCH LINEAR WITH AI-GENERATED TERMS
                // Now that AI has identified the feature/component, search Linear
                try {
                    // Search all teams (not limited to selected team)
                    // This gives best chance of finding similar issues across the product
                    const results = await window.ZDLinear.searchAllTeams({
                        search: searchQuery,
                        stateId: undefined  // Don't filter by status
                    }, linearApiKey);

                    // STEP 8: DISPLAY RESULTS WITH AI CONTEXT
                    // Show results with a banner explaining what AI searched for and why
                    // This transparency helps users understand the AI's reasoning
                    displayResults(results, {
                        isAISearch: true,
                        searchQuery: searchQuery,
                        summary: summary
                    });

                    // Re-enable controls so user can refine search if needed
                    enableControls();
                } catch (error) {
                    console.error('[Linear Panel] AI search failed:', error);
                    showErrorState(error.message);
                    enableControls();
                }
            });

        } catch (error) {
            console.error('[Linear Panel] AI search failed:', error);
            showErrorState(error.message);
            enableControls();
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
     * This function renders the search results in the panel. It supports both
     * manual search and AI search, with special handling for AI context.
     *
     * @param {Array} results - Array of Linear issues from ZDLinear.searchIssues()
     * @param {Object} context - Optional context object:
     *   - isAISearch: {boolean} Whether this was AI-generated search
     *   - searchQuery: {string} What terms were searched
     *   - summary: {string} AI's explanation of what the ticket is about
     *
     * AI CONTEXT BANNER:
     * When results come from AI search, we show a banner at the top explaining:
     * - That this was AI-generated (transparency)
     * - What search terms were used
     * - Why (the AI's understanding of the ticket)
     *
     * This helps users understand the AI's reasoning and decide if they need
     * to refine the search manually.
     */
    function displayResults(results, context = null) {
        if (!linearPanelEl) return;

        const resultsContainer = linearPanelEl.querySelector('.zd-linear-results-container');

        // AI SEARCH BANNER
        // If this was an AI search, add a banner explaining what was searched and why.
        // We show this banner EVEN when there are no results, so the user understands
        // what the AI tried to search for (helps with debugging when no results found).
        let aiBannerHTML = '';
        if (context?.isAISearch) {
            aiBannerHTML = `
                <div class="zd-linear-ai-banner">
                    <div class="zd-linear-ai-banner-icon">🤖</div>
                    <div class="zd-linear-ai-banner-content">
                        <div class="zd-linear-ai-banner-title">AI-Generated Search</div>
                        <div class="zd-linear-ai-banner-query">Searched for: "${context.searchQuery}"</div>
                        <div class="zd-linear-ai-banner-summary">${context.summary}</div>
                    </div>
                </div>
            `;
        }

        if (!results || results.length === 0) {
            const noResultsHint = context?.isAISearch
                ? 'No similar issues found with AI search terms. Try manual search below.'
                : 'Try different filters or search terms';

            resultsContainer.innerHTML = aiBannerHTML + `
                <div class="zd-linear-empty-state">
                    <div class="zd-linear-empty-icon">🔍</div>
                    <div class="zd-linear-empty-text">No issues found</div>
                    <div class="zd-linear-empty-hint">${noResultsHint}</div>
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

        resultsContainer.innerHTML = aiBannerHTML + resultsHTML;

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
