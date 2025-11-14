# Changelog

All notable changes to Support Toolkit will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Multi-browser support (Firefox, Safari)
- Customizable keyboard shortcuts
- Data export formats (JSON, CSV, Excel)
- Unit tests and CI/CD pipeline

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

[Unreleased]: https://github.com/mauropereiira/support-toolkit/compare/v2.5.0...HEAD
[2.5.0]: https://github.com/mauropereiira/support-toolkit/compare/v2.4.0...v2.5.0
[2.4.0]: https://github.com/mauropereiira/support-toolkit/compare/v2.3.0...v2.4.0
[2.3.0]: https://github.com/mauropereiira/support-toolkit/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/mauropereiira/support-toolkit/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/mauropereiira/support-toolkit/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/mauropereiira/support-toolkit/compare/v1.5.0...v2.0.0
[1.5.0]: https://github.com/mauropereiira/support-toolkit/compare/v1.0.0...v1.5.0
[1.0.0]: https://github.com/mauropereiira/support-toolkit/releases/tag/v1.0.0
