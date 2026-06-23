# Changelog

All notable changes to Support Toolkit will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Customize Zendesk** menu (new toolbar button): reshape the Agent Workspace to your taste
  - Layout: put each ticket pane (Conversation, Notes, User Info) in any column; panes sharing a column **stack vertically** into one tall bar (e.g. Notes under User Info) to use unused vertical space. Presets: Swap sidebars, Both sidebars right, Stack sidebars left/right. Per-pane **Show/Hide**.
  - Plain reorder keeps Zendesk's native drag-to-resize working (only restructured/stacked layouts use fixed widths).
  - Theme: optionally apply the toolbar's themes/colors across Zendesk — now covering the top bar, left nav rail, conversation pane and composer bar, not just the header (opt-in; off by default so a fresh install never alters Zendesk's canvas)
  - Text & Density: conversation font, text size, and spacing
  - Applied via a single injected stylesheet at document_start; settings sync per user and persist across pages and reloads
- Full control over every shift warning (start, late login, end of shift): each can be independently enabled/disabled and have its timing adjusted, not just the pre-shift warning

### Fixed
- Customizer: font / text-size / density now actually apply (the conversation selector was wrong — `omni-log` instead of `omni-log-container`/`omni-log-comment-item`, so the rules matched nothing)
- Customizer: swapping/placing both sidebars on one side no longer breaks Zendesk's native column resize (plain reorder emits only CSS `order`, leaving Zendesk's inline track sizing intact)
- Late-login shift warning could never fire (was evaluated against a not-yet-started shift); now correctly checks the active shift
- Pre-shift warning timing now actually applies (settings saved `preShiftWarningMinutes` but the timer read `startShiftWarningMinutes`); existing saved values are migrated automatically

### Planned
- Multi-browser support (Firefox, Safari)
- Customizable keyboard shortcuts
- Data export formats (JSON, CSV, Excel)
- Unit tests and CI/CD pipeline

## [3.0.0] - 2025-01-19

### Added
- LibreChat AI panel - embedded chat.a8c.com within Zendesk
- What's New popup with GIF animation on version updates
- Changelog viewer in Developer Tools
- New brain icon for AI features

### Changed
- Version update notifications now match shift notification style
- Improved shift notification timing (5 min start, 10 min end warnings)
- Updated notification GIFs (non-Christmas themed)

### Fixed
- Prevent duplicate counts on same ticket within 60 seconds

## [2.9.0] - 2025-01-15

### Fixed
- Prevent duplicate counts on same ticket within 60 seconds

## [2.8.3] - 2025-12-10

### Fixed
- Force light mode on table header row in Worked Log

## [2.8.2] - 2025-12-10

### Fixed
- Force light mode colors on Worked Log table cells

## [2.8.1] - 2025-12-10

### Fixed
- Worked Log table not readable in light mode

## [2.8.0] - 2025-12-10

### Added
- Worked Log feature with comprehensive polish
- Track daily work with clickable ticket links
- Automatic date grouping and timestamps

## [2.7.0] - 2025-12-04

### Added
- Enhanced Linear Integration with design token system
- Comprehensive micro-interactions (phases 1 & 2)
- Subtle depth effects (shadows in light mode, glow in dark mode)

### Removed
- Translator feature completely removed
- AI Copilot integration removed
- All Christmas theme references removed

### Fixed
- Theme presets now apply correctly (CSS variable mismatch)
- Preserve dark/light mode when saving settings
- Timer colors on toolbar now use theme variables in dark mode
- Dark mode now respects theme color selection
- Percentage and accent colors now use theme variables

## [2.6.2] - 2025-01-26

### Changed
- **Privacy-First Approach**: Removed all external AI API integration to protect customer data
- Replaced AI-powered search with local keyword extraction (no data leaves browser)
- Keyword suggestions are now generated entirely client-side
- Added clickable keyword chips UI for quick Linear searches
- Improved keyword extraction algorithm with comprehensive stopword filtering
- Keywords now prioritize capitalized terms (product names, features)

### Removed
- Google Gemini AI integration for Linear search
- AI context banner from search results
- Gemini API key requirement
- All external API calls for ticket analysis

### Technical
- All transcript analysis now happens locally in browser
- Enhanced stopword list for better keyword relevance
- Frequency-based keyword scoring with technical term bonuses
- No customer conversation data sent to third-party services

## [2.6.1] - 2025-01-22

### Added
- AI-powered "Find Similar Issues" feature for Linear integration
- Intelligent transcript extraction from Zendesk tickets
- Context-aware keyword extraction with fallback support
- Automatic search query generation using Gemini 2.5 Flash
- Smart team dropdown with "All Teams" default selection

### Changed
- Linear panel now defaults to "All Teams" on open
- Removed auto-focus on team input for better UX
- Team input auto-selects text when clicked for easy filtering
- Improved AI prompt for better feature name extraction
- Increased token limits to handle Gemini's thinking overhead

### Fixed
- Linear panel no longer blocks interaction on open
- Team dropdown shows properly when input is clicked
- Transcript extraction works across different Zendesk layouts
- Better error handling with graceful fallback to keyword extraction

## [2.6.0] - 2025-11-21

### Added
- Linear integration for issue search and tracking
- Linear API key configuration in settings
- Linear panel UI with team filtering and status selection
- Real-time Linear issue search across teams

## [2.5.0] - 2025-11-14

### Added
- Christmas theme enhancements with glassmorphism UI design
- Sound system with 7 distinct sound types for interactions
- Snowfall animation system with dynamic particle generation
- Christmas decorations: 5 custom SVG assets (snowflake, star, gift, tree, bell)
- Enhanced settings modal header with seasonal icons
- Premium glassmorphism effects with backdrop-filter
- 4 custom CSS animations (snowfall, sparkle, glow-pulse, shimmer)
- `sounds.js` module for professional audio feedback
- `styles-christmas.css` with complete seasonal theme (691 lines)
- `styles-backup.css` for easy reversion to original styles
- Comprehensive documentation for Christmas enhancements

### Changed
- Updated `manifest.json` to include sounds.js in content scripts
- Enhanced `content.js` with snowfall initialization and decorations
- Replaced `styles.css` with Christmas-themed version
- Improved button hover effects with scale transforms and glow
- Updated toolbar styling with Christmas gradient and decorations

### Fixed
- Performance optimizations for animations (GPU acceleration)
- Graceful degradation when sound files are missing
- Better error handling in sound playback system

## [2.4.0] - 2024-12-01

### Added
- AI Copilot integration with Google Gemini 2.5 Flash
- Background service worker for AI API calls
- User-configurable API key management
- Rate limiting for AI requests
- Context-aware assistance for support queries

### Changed
- Migrated to Chrome Extension Manifest V3
- Improved error handling with retry logic and exponential backoff
- Enhanced performance with throttling and debouncing

### Fixed
- Memory leaks in long-running sessions
- Storage sync issues across devices

## [2.3.0] - 2024-10-15

### Added
- Comprehensive activity logging with timeline view
- Weekly history tracking with performance metrics
- Enhanced shift management with ICS calendar integration
- Backup and restore functionality for user data
- Theme support (light and dark modes)
- Draggable toolbar with persistent position saving
- Dev mode with testing tools and manual controls

### Changed
- Improved statistics calculations with hourly averages
- Enhanced notification system with toast UI
- Better Zendesk DOM detection for auto-increment
- Optimized storage operations with caching

### Fixed
- Daily rollover timing issues
- Counter synchronization across tabs
- Calendar parsing edge cases

## [2.2.0] - 2024-08-20

### Added
- Notes system with rich text editor
- Category-based organization for notes
- Search and filter functionality
- Export capabilities for notes

### Changed
- Improved UI with better visual hierarchy
- Enhanced modal designs with animations
- Better mobile responsiveness (for testing)

### Fixed
- Notification timing issues
- Storage quota warnings

## [2.1.0] - 2024-06-10

### Added
- Statistics and analytics dashboard
- Daily/weekly/monthly breakdowns
- Average response time calculations
- Interaction trends visualization
- Activity log with detailed timeline

### Changed
- Refactored storage layer for better performance
- Improved error handling across all modules
- Enhanced configuration system with feature flags

### Fixed
- Counter persistence issues
- Shift detection accuracy
- Calendar refresh logic

## [2.0.0] - 2024-04-01

### Added
- Shift management system
- ICS calendar integration with schedule.happy.tools
- Live countdown timers for shifts
- Pre-shift warnings and end-of-shift alerts
- Audio notifications (shift-alert.mp3)
- Today's schedule viewer
- Auto-detection of chat vs ticket shifts

### Changed
- Complete UI redesign with floating toolbar
- Modular architecture with IIFE pattern
- Separation of concerns into dedicated modules
- Chrome Storage API for data persistence

### Fixed
- Performance issues with DOM observation
- Memory leaks in timer system
- Cross-tab synchronization

## [1.5.0] - 2024-02-15

### Added
- Auto-increment detection for Zendesk tickets
- Manual increment/decrement controls
- Goal tracking with hourly targets
- Completion percentage calculations

### Changed
- Improved counter accuracy
- Better Zendesk selector targeting
- Enhanced visual feedback for interactions

### Fixed
- False positives in auto-increment detection
- Counter reset timing

## [1.0.0] - 2024-01-01

### Added
- Initial release
- Live counter system for chats and tickets
- Basic statistics tracking
- Manual increment/decrement buttons
- Simple settings modal
- Chrome Storage sync
- Basic toolbar UI

### Features
- Real-time tracking of customer interactions
- Daily rollover at midnight
- Persistent storage across sessions
- Basic goal setting

---

## Version Format

This project uses [Semantic Versioning](https://semver.org/):
- **MAJOR** version for incompatible API changes
- **MINOR** version for new functionality in a backwards compatible manner
- **PATCH** version for backwards compatible bug fixes

## Categories

Changes are grouped by category:
- **Added** for new features
- **Changed** for changes in existing functionality
- **Deprecated** for soon-to-be removed features
- **Removed** for now removed features
- **Fixed** for any bug fixes
- **Security** for vulnerability fixes

---

[Unreleased]: https://github.com/Automattic/support-toolkit/compare/v3.0.0...HEAD
[3.0.0]: https://github.com/Automattic/support-toolkit/compare/v2.9.0...v3.0.0
[2.9.0]: https://github.com/Automattic/support-toolkit/compare/v2.8.3...v2.9.0
[2.8.3]: https://github.com/Automattic/support-toolkit/compare/v2.8.2...v2.8.3
[2.8.2]: https://github.com/Automattic/support-toolkit/compare/v2.8.1...v2.8.2
[2.8.1]: https://github.com/Automattic/support-toolkit/compare/v2.8.0...v2.8.1
[2.8.0]: https://github.com/Automattic/support-toolkit/compare/v2.7.0...v2.8.0
[2.7.0]: https://github.com/Automattic/support-toolkit/compare/v2.6.2...v2.7.0
[2.6.2]: https://github.com/Automattic/support-toolkit/compare/v2.6.1...v2.6.2
[2.6.1]: https://github.com/Automattic/support-toolkit/compare/v2.6.0...v2.6.1
[2.6.0]: https://github.com/Automattic/support-toolkit/compare/v2.5.0...v2.6.0
[2.5.0]: https://github.com/Automattic/support-toolkit/compare/v2.4.0...v2.5.0
[2.4.0]: https://github.com/Automattic/support-toolkit/compare/v2.3.0...v2.4.0
[2.3.0]: https://github.com/Automattic/support-toolkit/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/Automattic/support-toolkit/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/Automattic/support-toolkit/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/Automattic/support-toolkit/compare/v1.5.0...v2.0.0
[1.5.0]: https://github.com/Automattic/support-toolkit/compare/v1.0.0...v1.5.0
[1.0.0]: https://github.com/Automattic/support-toolkit/releases/tag/v1.0.0
