// Linear GraphQL API integration for issue search
// Stores API keys locally using chrome.storage.sync (encrypted by Chrome)

(function () {
    'use strict';

    const LINEAR_API_ENDPOINT = 'https://api.linear.app/graphql';

    // Debounce helper
    let searchDebounceTimer = null;
    const DEBOUNCE_DELAY = 300;

    /**
     * Make GraphQL request to Linear API
     * @param {string} query - GraphQL query string
     * @param {Object} variables - Query variables
     * @param {string} apiKey - Linear API key
     * @returns {Promise<Object>} Response data
     */
    async function makeLinearRequest(query, variables, apiKey) {
        if (!apiKey || apiKey.trim() === '') {
            throw new Error('Linear API key is required');
        }

        try {
            const response = await fetch(LINEAR_API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': apiKey.trim()
                },
                body: JSON.stringify({
                    query,
                    variables
                })
            });

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Invalid API key. Please check your Linear API key in Settings.');
                }
                throw new Error(`Linear API error: ${response.status}`);
            }

            const data = await response.json();

            if (data.errors && data.errors.length > 0) {
                const errorMsg = data.errors[0].message || 'Unknown error';
                throw new Error(`Linear API error: ${errorMsg}`);
            }

            return data.data;
        } catch (error) {
            console.error('[Linear] API request failed:', error);
            throw error;
        }
    }

    /**
     * Get workflow states for a team
     * @param {string} teamKey - Team key (e.g. "ENG")
     * @param {string} apiKey - Linear API key
     * @returns {Promise<Array>} Array of workflow state objects
     */
    async function getWorkflowStates(teamKey, apiKey) {
        try {
            const graphqlQuery = `
                query($teamKey: String!) {
                    workflowStates(filter: { team: { key: { eq: $teamKey } } }) {
                        nodes {
                            id
                            name
                            type
                        }
                    }
                }
            `;

            const data = await makeLinearRequest(graphqlQuery, { teamKey }, apiKey);

            if (!data || !data.workflowStates || !data.workflowStates.nodes) {
                return [];
            }

            return data.workflowStates.nodes;
        } catch (error) {
            console.error('[Linear] Get workflow states failed:', error);
            return [];
        }
    }

    /**
     * Search Linear issues with dynamic filters
     * @param {Object} params - Search parameters
     * @param {string} params.teamKey - Team key (required)
     * @param {string} params.search - Search query (optional)
     * @param {string} params.stateId - State ID filter (optional)
     * @param {Array<number>} params.priority - Priority values to filter by (optional)
     * @param {string} params.createdAfter - ISO 8601 date string or relative duration (optional)
     * @param {string} apiKey - Linear API key
     * @returns {Promise<Array>} Array of issue objects
     */
    async function searchIssues(params, apiKey) {
        const { teamKey, search, stateId, priority, createdAfter } = params;

        if (!teamKey || teamKey.trim() === '') {
            throw new Error('Team is required for search');
        }

        try {
            // Build filter parts
            const filterParts = ['team: { key: { eq: $teamKey } }'];
            const variables = { teamKey: teamKey.trim() };

            if (stateId && stateId.trim() !== '') {
                filterParts.push('state: { id: { eq: $stateId } }');
                variables.stateId = stateId.trim();
            }

            if (search && search.trim() !== '') {
                filterParts.push('or: [ { title: { containsIgnoreCase: $search } }, { description: { containsIgnoreCase: $search } } ]');
                variables.search = search.trim();
            }

            if (priority && priority.length > 0) {
                filterParts.push('priority: { in: $priority }');
                variables.priority = priority;
            }

            if (createdAfter) {
                filterParts.push('createdAt: { gte: $createdAfter }');
                variables.createdAfter = createdAfter;
            }

            const filterString = `{ ${filterParts.join(', ')} }`;

            // Build query with conditional variables
            let queryVariables = '$teamKey: String!';
            if (stateId && stateId.trim() !== '') queryVariables += ', $stateId: ID!';
            if (search && search.trim() !== '') queryVariables += ', $search: String!';
            if (priority && priority.length > 0) queryVariables += ', $priority: [Int!]!';
            if (createdAfter) queryVariables += ', $createdAfter: DateTime!';

            const graphqlQuery = `
                query(${queryVariables}) {
                    issues(filter: ${filterString}, first: 100, orderBy: updatedAt) {
                        nodes {
                            id
                            identifier
                            title
                            description
                            assignee {
                                name
                                email
                            }
                            creator {
                                name
                                email
                            }
                            state {
                                id
                                name
                                type
                            }
                            priority
                            priorityLabel
                            createdAt
                            updatedAt
                            url
                            team {
                                id
                                name
                                key
                            }
                            labels {
                                nodes {
                                    name
                                    color
                                }
                            }
                        }
                    }
                }
            `;

            const data = await makeLinearRequest(graphqlQuery, variables, apiKey);

            if (!data || !data.issues || !data.issues.nodes) {
                return [];
            }

            return data.issues.nodes;
        } catch (error) {
            console.error('[Linear] Search failed:', error);
            throw error;
        }
    }


    /**
     * Search Linear issues across all teams
     * @param {Object} params - Search parameters
     * @param {string|null} params.search - Search query (optional)
     * @param {string|null} params.stateId - State ID to filter by (optional)
     * @param {Array<number>} params.priority - Priority values to filter by (optional)
     * @param {string} params.createdAfter - ISO 8601 date string or relative duration (optional)
     * @param {string} apiKey - Linear API key
     * @returns {Promise<Array>} Array of issue objects
     */
    async function searchAllTeams(params, apiKey) {
        try {
            const { search, stateId, priority, createdAfter } = params;

            // Build filter parts
            const filterParts = [];
            const variables = {};

            if (stateId) {
                filterParts.push('state: { id: { eq: $stateId } }');
                variables.stateId = stateId;
            }

            if (search) {
                filterParts.push('or: [ { title: { containsIgnoreCase: $search } }, { description: { containsIgnoreCase: $search } } ]');
                variables.search = search;
            }

            if (priority && priority.length > 0) {
                filterParts.push('priority: { in: $priority }');
                variables.priority = priority;
            }

            if (createdAfter) {
                filterParts.push('createdAt: { gte: $createdAfter }');
                variables.createdAfter = createdAfter;
            }

            const filterString = filterParts.length > 0 ? `filter: { ${filterParts.join(', ')} }` : '';

            // Build query with conditional variables
            let queryVariables = '';
            const varParts = [];
            if (stateId) varParts.push('$stateId: ID!');
            if (search) varParts.push('$search: String!');
            if (priority && priority.length > 0) varParts.push('$priority: [Int!]!');
            if (createdAfter) varParts.push('$createdAfter: DateTime!');
            if (varParts.length > 0) {
                queryVariables = `(${varParts.join(', ')})`;
            }

            const graphqlQuery = `
                query${queryVariables} {
                    issues(${filterString}, first: 100, orderBy: updatedAt) {
                        nodes {
                            id
                            identifier
                            title
                            description
                            assignee {
                                name
                                email
                            }
                            creator {
                                name
                                email
                            }
                            state {
                                id
                                name
                                type
                            }
                            priority
                            priorityLabel
                            createdAt
                            updatedAt
                            url
                            team {
                                id
                                name
                                key
                            }
                            labels {
                                nodes {
                                    name
                                    color
                                }
                            }
                        }
                    }
                }
            `;

            const data = await makeLinearRequest(graphqlQuery, variables, apiKey);

            if (!data || !data.issues || !data.issues.nodes) {
                return [];
            }

            return data.issues.nodes;
        } catch (error) {
            console.error('[Linear] Search all teams failed:', error);
            throw error;
        }
    }

    /**
     * Get list of teams/workspaces with pagination
     * @param {string} apiKey - Linear API key
     * @returns {Promise<Array>} Array of team objects
     */
    async function getTeams(apiKey) {
        try {
            const allTeams = [];
            let hasNextPage = true;
            let cursor = null;

            while (hasNextPage) {
                const graphqlQuery = `
                    query($after: String) {
                        teams(first: 200, after: $after) {
                            nodes {
                                id
                                key
                                name
                            }
                            pageInfo {
                                hasNextPage
                                endCursor
                            }
                        }
                    }
                `;

                const variables = cursor ? { after: cursor } : {};
                const data = await makeLinearRequest(graphqlQuery, variables, apiKey);

                if (!data || !data.teams || !data.teams.nodes) {
                    break;
                }

                const teams = data.teams.nodes || [];
                allTeams.push(...teams);

                hasNextPage = data.teams.pageInfo.hasNextPage || false;
                cursor = data.teams.pageInfo.endCursor || null;

                if (teams.length === 0) {
                    break;
                }
            }

            return allTeams;
        } catch (error) {
            console.error('[Linear] Get teams failed:', error);
            return [];
        }
    }

    /**
     * Format priority label for display
     * @param {number} priority - Priority number (0-4)
     * @param {string} priorityLabel - Priority label
     * @returns {string} Formatted priority string
     */
    function formatPriority(priority, priorityLabel) {
        if (priorityLabel) {
            return priorityLabel;
        }

        // Fallback to priority number
        const priorityMap = {
            0: 'No priority',
            1: 'Urgent',
            2: 'High',
            3: 'Medium',
            4: 'Low'
        };

        return priorityMap[priority] || 'Unknown';
    }

    /**
     * Format date for display
     * @param {string} dateString - ISO date string
     * @returns {string} Formatted date
     */
    function formatDate(dateString) {
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            if (diffDays === 0) {
                return 'Today';
            } else if (diffDays === 1) {
                return 'Yesterday';
            } else if (diffDays < 7) {
                return `${diffDays}d ago`;
            } else if (diffDays < 30) {
                const weeks = Math.floor(diffDays / 7);
                return `${weeks}w ago`;
            } else if (diffDays < 365) {
                const months = Math.floor(diffDays / 30);
                return `${months}mo ago`;
            } else {
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            }
        } catch (error) {
            return dateString;
        }
    }

    /**
     * Get issues assigned to the authenticated user
     * @param {string} apiKey - Linear API key
     * @param {Object} filters - Optional filters
     * @param {Array<number>} filters.priority - Priority values to filter by
     * @param {string} filters.createdAfter - ISO 8601 date string or relative duration (e.g., "-P7D")
     * @returns {Promise<Array>} Array of issue objects
     */
    async function getMyAssignedIssues(apiKey, filters = {}) {
        try {
            // Build filter parts
            const filterParts = [];
            const variables = {};

            if (filters.priority && filters.priority.length > 0) {
                filterParts.push('priority: { in: $priority }');
                variables.priority = filters.priority;
            }

            if (filters.createdAfter) {
                filterParts.push('createdAt: { gte: $createdAfter }');
                variables.createdAfter = filters.createdAfter;
            }

            const filterString = filterParts.length > 0 ? `filter: { ${filterParts.join(', ')} }, ` : '';

            // Build query with conditional variables
            let queryVariables = '';
            if (filters.priority && filters.priority.length > 0) queryVariables += '$priority: [Int!]!';
            if (filters.createdAfter) {
                if (queryVariables) queryVariables += ', ';
                queryVariables += '$createdAfter: DateTime!';
            }
            if (queryVariables) queryVariables = `(${queryVariables})`;

            const graphqlQuery = `
                query${queryVariables} {
                    viewer {
                        assignedIssues(${filterString}first: 100) {
                            nodes {
                                id
                                identifier
                                title
                                description
                                assignee {
                                    name
                                    email
                                }
                                creator {
                                    name
                                    email
                                }
                                state {
                                    id
                                    name
                                    type
                                }
                                priority
                                priorityLabel
                                createdAt
                                updatedAt
                                url
                                team {
                                    id
                                    name
                                    key
                                }
                                labels {
                                    nodes {
                                        name
                                        color
                                    }
                                }
                            }
                        }
                    }
                }
            `;

            const data = await makeLinearRequest(graphqlQuery, variables, apiKey);

            if (!data || !data.viewer || !data.viewer.assignedIssues || !data.viewer.assignedIssues.nodes) {
                return [];
            }

            return data.viewer.assignedIssues.nodes;
        } catch (error) {
            console.error('[Linear] Get assigned issues failed:', error);
            throw error;
        }
    }

    /**
     * Get issues created by the authenticated user
     * @param {string} apiKey - Linear API key
     * @param {Object} filters - Optional filters
     * @param {Array<number>} filters.priority - Priority values to filter by
     * @param {string} filters.createdAfter - ISO 8601 date string or relative duration (e.g., "-P7D")
     * @returns {Promise<Array>} Array of issue objects
     */
    async function getMyCreatedIssues(apiKey, filters = {}) {
        try {
            // Build filter parts
            const filterParts = [];
            const variables = {};

            if (filters.priority && filters.priority.length > 0) {
                filterParts.push('priority: { in: $priority }');
                variables.priority = filters.priority;
            }

            if (filters.createdAfter) {
                filterParts.push('createdAt: { gte: $createdAfter }');
                variables.createdAfter = filters.createdAfter;
            }

            const filterString = filterParts.length > 0 ? `filter: { ${filterParts.join(', ')} }, ` : '';

            // Build query with conditional variables
            let queryVariables = '';
            if (filters.priority && filters.priority.length > 0) queryVariables += '$priority: [Int!]!';
            if (filters.createdAfter) {
                if (queryVariables) queryVariables += ', ';
                queryVariables += '$createdAfter: DateTime!';
            }
            if (queryVariables) queryVariables = `(${queryVariables})`;

            const graphqlQuery = `
                query${queryVariables} {
                    viewer {
                        createdIssues(${filterString}first: 100) {
                            nodes {
                                id
                                identifier
                                title
                                description
                                assignee {
                                    name
                                    email
                                }
                                creator {
                                    name
                                    email
                                }
                                state {
                                    id
                                    name
                                    type
                                }
                                priority
                                priorityLabel
                                createdAt
                                updatedAt
                                url
                                team {
                                    id
                                    name
                                    key
                                }
                                labels {
                                    nodes {
                                        name
                                        color
                                    }
                                }
                            }
                        }
                    }
                }
            `;

            const data = await makeLinearRequest(graphqlQuery, variables, apiKey);

            if (!data || !data.viewer || !data.viewer.createdIssues || !data.viewer.createdIssues.nodes) {
                return [];
            }

            return data.viewer.createdIssues.nodes;
        } catch (error) {
            console.error('[Linear] Get created issues failed:', error);
            throw error;
        }
    }

    /**
     * Calculate ISO 8601 date from days ago
     * @param {number} daysAgo - Number of days in the past
     * @returns {string} ISO 8601 date string
     */
    function calculateDateFromDaysAgo(daysAgo) {
        const date = new Date();
        date.setDate(date.getDate() - daysAgo);
        date.setHours(0, 0, 0, 0); // Start of day
        return date.toISOString();
    }

    // Export to global scope
    window.ZDLinear = {
        searchIssues,
        searchAllTeams,
        getTeams,
        getWorkflowStates,
        getMyAssignedIssues,
        getMyCreatedIssues,
        formatPriority,
        formatDate,
        calculateDateFromDaysAgo
    };

})();
