// Linear search panel UI component
// Right-side panel for searching Linear issues

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

        const teamInput = linearPanelEl.querySelector('#zd-linear-team-input');
        const teamDropdown = linearPanelEl.querySelector('#zd-linear-team-dropdown');
        const statusSelect = linearPanelEl.querySelector('#zd-linear-status-select');
        const searchInput = linearPanelEl.querySelector('#zd-linear-search-input');
        const searchBtn = linearPanelEl.querySelector('#zd-linear-search-btn');
        const closeBtn = linearPanelEl.querySelector('.zd-linear-close-btn');

        // Team input focus - show dropdown
        teamInput.addEventListener('focus', () => {
            if (allTeams.length > 0) {
                showTeamDropdown = true;
                updateTeamDropdown(teamInput.value);
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
    function showLoadingState() {
        if (!linearPanelEl) return;

        const resultsContainer = linearPanelEl.querySelector('.zd-linear-results-container');
        resultsContainer.innerHTML = `
            <div class="zd-linear-loading">
                <div class="zd-linear-loading-spinner"></div>
                <div class="zd-linear-loading-text">Searching...</div>
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
     */
    async function toggleLinearPanel() {
        // Check if API key is configured
        const cfg = await window.ZDStorage.getConfig();

        if (!cfg.linearApiKey || cfg.linearApiKey.trim() === '') {
            showLinearSetupModal();
            return;
        }

        // Create panel if it doesn't exist
        if (!linearPanelEl) {
            createLinearPanel();
        }

        // Toggle visibility
        isLinearPanelVisible = !isLinearPanelVisible;

        if (isLinearPanelVisible) {
            linearPanelEl.style.display = 'flex';

            // Load teams when panel opens
            await loadTeams();

            // Focus team input
            const teamInput = linearPanelEl.querySelector('#zd-linear-team-input');
            if (teamInput) {
                setTimeout(() => teamInput.focus(), 100);
            }
        } else {
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
