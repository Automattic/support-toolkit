// Changelog data for version notifications and What's New modal
// Stores recent version history for in-app display

(function () {
    'use strict';

    const VERSIONS = [
        {
            version: '3.0.0',
            date: '2025-01-19',
            highlights: [
                'LibreChat AI panel',
                'What\'s New popup',
                'Improved notifications'
            ],
            changes: [
                { type: 'feat', text: 'Add LibreChat AI panel for embedded chat.a8c.com' },
                { type: 'feat', text: 'Add What\'s New popup with GIF on version updates' },
                { type: 'feat', text: 'Add changelog viewer in Developer Tools' },
                { type: 'feat', text: 'New brain icon for AI features' },
                { type: 'change', text: 'Version notifications now match shift notification style' },
                { type: 'fix', text: 'Separate shift start/end warning timing (5/10 min)' },
                { type: 'fix', text: 'Update notification GIFs (non-Christmas themed)' }
            ]
        },
        {
            version: '2.9.0',
            date: '2025-01-15',
            highlights: [
                'Duplicate count prevention'
            ],
            changes: [
                { type: 'fix', text: 'Prevent duplicate counts on same ticket within 60 seconds' }
            ]
        },
        {
            version: '2.8.3',
            date: '2025-01-10',
            highlights: [
                'Light mode table fixes'
            ],
            changes: [
                { type: 'fix', text: 'Force light mode on table header row in Worked Log' }
            ]
        },
        {
            version: '2.8.2',
            date: '2025-01-10',
            highlights: [
                'Worked Log readability'
            ],
            changes: [
                { type: 'fix', text: 'Force light mode colors on Worked Log table cells' }
            ]
        },
        {
            version: '2.8.1',
            date: '2025-01-10',
            highlights: [
                'Table visibility fix'
            ],
            changes: [
                { type: 'fix', text: 'Worked Log table not readable in light mode' }
            ]
        },
        {
            version: '2.8.0',
            date: '2025-01-12',
            highlights: [
                'Worked Log feature',
                'Daily work tracking'
            ],
            changes: [
                { type: 'feat', text: 'Add Worked Log feature with comprehensive polish' },
                { type: 'feat', text: 'Track daily work with clickable ticket links' },
                { type: 'feat', text: 'Automatic date grouping and timestamps' }
            ]
        },
        {
            version: '2.7.0',
            date: '2025-01-04',
            highlights: [
                'Enhanced Linear Integration',
                'Micro-interactions'
            ],
            changes: [
                { type: 'feat', text: 'Enhanced Linear Integration with design token system' },
                { type: 'feat', text: 'Comprehensive micro-interactions (phases 1 & 2)' },
                { type: 'feat', text: 'Subtle depth effects (shadows/glow)' },
                { type: 'remove', text: 'Translator feature removed' },
                { type: 'remove', text: 'AI Copilot integration removed' },
                { type: 'fix', text: 'Theme presets now apply correctly' },
                { type: 'fix', text: 'Dark mode respects theme color selection' }
            ]
        }
    ];

    // GIF for version update notification (Game of Thrones celebration)
    const UPDATE_GIF = 'https://media.giphy.com/media/a2euXnuLIgVQA/giphy.gif';

    /**
     * Get a specific version's changelog
     */
    function getVersion(v) {
        return VERSIONS.find(ver => ver.version === v);
    }

    /**
     * Get the latest version entry
     */
    function getLatest() {
        return VERSIONS[0];
    }

    /**
     * Get the most recent N versions
     */
    function getRecent(count = 3) {
        return VERSIONS.slice(0, count);
    }

    /**
     * Get all versions
     */
    function getAll() {
        return VERSIONS;
    }

    /**
     * Get type icon for change
     */
    function getTypeIcon(type) {
        const icons = {
            feat: '✨',
            fix: '🔧',
            remove: '🗑️',
            change: '📝',
            security: '🔒'
        };
        return icons[type] || '•';
    }

    /**
     * Get type label for change
     */
    function getTypeLabel(type) {
        const labels = {
            feat: 'New',
            fix: 'Fix',
            remove: 'Removed',
            change: 'Changed',
            security: 'Security'
        };
        return labels[type] || 'Update';
    }

    /**
     * Format date for display
     */
    function formatDate(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    // Export to global scope
    window.ZDChangelog = {
        VERSIONS,
        UPDATE_GIF,
        getVersion,
        getLatest,
        getRecent,
        getAll,
        getTypeIcon,
        getTypeLabel,
        formatDate
    };

})();
