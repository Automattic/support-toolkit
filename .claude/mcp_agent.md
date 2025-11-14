# Support Toolkit - MCP Agent Context

## Project Overview
**Support Toolkit** is a Chrome Extension (Manifest V3) designed for Happiness Engineers at Automattic. Originally built as an interaction tracker, it has evolved into a comprehensive quality-of-life tool for customer support workflows on Zendesk.

**Current Version:** 2.5.0
**Author:** Mauro Pereira
**License:** MIT
**Platform:** Chrome Extension Manifest V3

---

## Core Purpose
Provides Happiness Engineers with productivity enhancements while working in Zendesk:
- Real-time interaction counters (chats/tickets)
- Shift timing and scheduling integration
- Built-in notes system
- Statistics tracking
- AI-powered assistance (Google Gemini integration)
- Audio/visual notifications
- Calendar integration (ICS format)

---

## Architecture Overview

### Technology Stack
- **Language:** Vanilla JavaScript (ES6+), no frameworks or transpilation
- **Styling:** CSS3 with advanced features (backdrop-filter, CSS animations)
- **Build System:** None - runs directly in browser
- **Extension Type:** Chrome Extension Manifest V3
- **Target Platform:** Zendesk (*.zendesk.com, *.zopim.com, *.zendesk-staging.com)

### Module System
Uses IIFE (Immediately Invoked Function Expression) pattern with global namespaces:
- `window.ZDStorage` - Data persistence layer
- `window.ZDTimers` - Shift timing and scheduling
- `window.ZDNotifications` - Notification system
- `window.ZDUtils` - Helper utilities
- `window.ZDConfig` - Configuration constants
- `window.ZDErrorHandler` - Centralized error handling
- `window.ZDConstants` - Global constants

### File Structure (11 JavaScript files, 5,881 total lines)

**Core Logic:**
- `content.js` (3,606 lines) - Main UI rendering, modal management, interaction tracking
- `background.js` (82 lines) - Service worker for Google Gemini API calls

**Data & Storage:**
- `storage.js` (655 lines) - Chrome Storage API abstraction, backup/restore functionality

**Timing System:**
- `timers.js` (436 lines) - ICS calendar parsing, shift detection, countdown timers

**Notification System:**
- `notifications.js` (174 lines) - High-level notification orchestration
- `notification-utils.js` (140 lines) - Toast notifications, UI alerts

**Error Handling:**
- `error-handler.js` (240 lines) - Centralized error logging, retry logic with exponential backoff, error categorization

**Configuration:**
- `config.js` (145 lines) - Performance tuning, feature flags, validation schemas
- `constants.js` (103 lines) - Storage keys, default configuration, Zendesk DOM selectors
- `utils.js` (145 lines) - Time formatting, DOM helpers, throttling/debouncing

**UI Components:**
- `icons.js` (156 lines) - Dynamic SVG icon rendering

**Styling (3 CSS files, 5,029 total lines):**
- `styles.css` (3,191 lines) - Main production stylesheet
- `styles-christmas.css` (691 lines) - Seasonal theme with glassmorphism
- `styles-backup.css` (1,147 lines) - Original styles backup

---

## Key Features

### 1. Interaction Tracking
- Live counters for chats and tickets
- Manual increment/decrement controls
- Auto-increment detection (observes Zendesk DOM)
- Persistent storage across sessions
- Daily/weekly/monthly statistics

### 2. Shift Management
- ICS calendar integration (schedule.happy.tools)
- Real-time shift detection
- Countdown timers to shift start/end
- Visual indicators for active shifts
- Audio alerts for shift transitions

### 3. Notes System
- Rich text note editor
- Category-based organization
- Search/filter functionality
- Export capabilities
- Persistent storage

### 4. AI Copilot
- Google Gemini 2.5 Flash integration
- Context-aware assistance
- Runs in background service worker
- API key management
- Rate limiting and error handling

### 5. Notifications
- Toast notifications for events
- Audio alerts (shift-alert.mp3)
- Visual indicators
- Configurable notification preferences
- Non-intrusive design

### 6. Statistics & Analytics
- Daily/weekly/monthly breakdowns
- Average response times
- Interaction trends
- Visual charts and graphs
- Export functionality

### 7. Christmas Theme (Seasonal)
- Glassmorphism UI design
- Snowfall animations
- Custom SVG decorations (snowflake, star, gift, tree, bell)
- Christmas color palette (red, green, gold)
- Sparkle/glow animations
- Sound effects system (7 sound types)

---

## Coding Patterns & Best Practices

### 1. Module Pattern
```javascript
(function() {
  'use strict';

  const ZDModule = {
    init() { /* initialization */ },
    method() { /* functionality */ }
  };

  window.ZDModule = ZDModule;
})();
```

### 2. Error Handling
- All async operations wrapped in try-catch
- Centralized error handler with retry logic
- Error categorization (network, validation, storage, etc.)
- Graceful degradation for optional features
- Console logging with `[Support Toolkit]` prefix

### 3. Storage Abstraction
```javascript
// Always use ZDStorage, never direct Chrome API calls
await ZDStorage.get('key', defaultValue);
await ZDStorage.set('key', value);
await ZDStorage.increment('counter');
```

### 4. Performance Optimization
- Throttling/debouncing for frequent operations
- Lazy loading for heavy features
- Caching with TTL (Time To Live)
- DOM query result caching
- GPU-accelerated animations (transform, opacity)

### 5. Feature Flags
```javascript
// config.js contains feature flags
if (ZDConfig.features.aiCopilot) {
  // AI functionality
}
```

### 6. Validation
- Schema-based validation for all user inputs
- Type checking for API responses
- Sanitization for DOM insertion
- Bounds checking for numeric values

### 7. Naming Conventions
- Classes: `.zd-*` (e.g., `.zd-toolbar`, `.zd-modal`)
- IDs: Avoided when possible, prefer classes
- Variables: camelCase
- Constants: UPPER_SNAKE_CASE
- Functions: descriptive verbs (e.g., `handleClick`, `renderModal`)

---

## Development Decisions

### Why Vanilla JavaScript?
- Zero dependencies = faster load times
- No build process = simpler deployment
- Full control over code = better debugging
- Chrome extension compatibility = no tooling issues
- Smaller bundle size = better performance

### Why Manifest V3?
- Chrome's latest standard (future-proof)
- Better security model
- Service workers instead of background pages
- Improved performance

### Why No Package Manager?
- Extension is self-contained
- No external dependencies required
- Simpler maintenance
- Faster installation from source

### Why Global Namespaces?
- Content scripts run in isolated world
- Need to share state between modules
- Predictable module loading order
- Easy debugging in console

### Why Chrome Storage API?
- Sync across devices (chrome.storage.sync)
- No quota issues (chrome.storage.local)
- Async API (Promise-based)
- Automatic serialization

---

## Chrome Extension Specifics

### Manifest Structure
```json
{
  "manifest_version": 3,
  "permissions": ["storage"],
  "host_permissions": [
    "https://schedule.happy.tools/*",
    "https://lingva.ml/*",
    "https://generativelanguage.googleapis.com/*"
  ],
  "content_scripts": [{
    "matches": ["https://*.zendesk.com/*"],
    "js": ["error-handler.js", "config.js", "utils.js", ...],
    "css": ["styles.css"],
    "run_at": "document_idle"
  }],
  "background": {
    "service_worker": "background.js"
  }
}
```

### Content Script Injection Order
**Critical:** Files must load in dependency order:
1. `error-handler.js` - Must be first for error catching
2. `config.js` - Configuration constants
3. `utils.js` - Helper functions
4. `constants.js` - Global constants
5. `storage.js` - Storage layer
6. `notification-utils.js` - Toast notifications
7. `notifications.js` - Notification orchestration
8. `timers.js` - Timing system
9. `icons.js` - Icon rendering
10. `content.js` - Main application (must be last)

### Service Worker (background.js)
- Handles Google Gemini API calls
- No direct DOM access
- Message passing with content scripts
- Persistent across page loads

---

## API Integrations

### 1. Google Gemini 2.5 Flash
- **Endpoint:** `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent`
- **Purpose:** AI-powered assistance
- **Auth:** API key in request params
- **Rate Limits:** Handled in background.js
- **Fallback:** Graceful degradation if unavailable

### 2. Schedule Integration
- **Source:** `https://schedule.happy.tools/*`
- **Format:** ICS calendar files
- **Parser:** Custom ICS parser in timers.js
- **Features:** Shift detection, countdown timers
- **Refresh:** Configurable interval (default: 1 hour)

### 3. Lingva Translate
- **Endpoint:** `https://lingva.ml/*`
- **Purpose:** Translation functionality (future feature)
- **Status:** Permission granted, not yet implemented

---

## Testing & Quality Assurance

### Manual Testing Checklist
- [ ] Extension loads without console errors
- [ ] Toolbar renders on Zendesk pages
- [ ] Counters increment/decrement correctly
- [ ] Settings modal opens and saves
- [ ] Notes system CRUD operations
- [ ] Statistics display accurately
- [ ] Shift timers count down correctly
- [ ] Audio notifications play
- [ ] Backup/restore functionality works
- [ ] Chrome Storage syncs across devices

### Debugging
- **Dev Mode Toggle:** Set `devMode: true` in config.js
- **Console Logs:** All prefixed with `[Support Toolkit]`
- **Chrome DevTools:** Inspect content script context
- **Storage Inspector:** chrome://extensions/ > Service Worker > Console

### Performance Monitoring
- Watch for memory leaks in long sessions
- Monitor DOM mutation observer overhead
- Check animation frame rates (target: 60fps)
- Profile storage operation frequency

---

## Common Modification Patterns

### Adding a New Feature
1. Create feature flag in `config.js`
2. Add constants to `constants.js` if needed
3. Implement logic in appropriate module or `content.js`
4. Add UI elements in `content.js` render functions
5. Style in `styles.css` with `.zd-*` classes
6. Add error handling via `ZDErrorHandler`
7. Update documentation

### Adding a New Setting
1. Add to `DEFAULT_CONFIG` in `constants.js`
2. Create UI control in `renderSettingsModal()` (content.js)
3. Add validation schema in `config.js`
4. Handle change event and save via `ZDStorage.set()`
5. Update documentation

### Adding a New Counter Type
1. Add counter key to `STORAGE_KEYS` in `constants.js`
2. Initialize in `ZDStorage.initializeStorage()`
3. Add UI elements in `createToolbar()` (content.js)
4. Wire up increment/decrement handlers
5. Update statistics calculations

### Adding a New API Integration
1. Add host permission to `manifest.json`
2. Implement API client in new module or `background.js`
3. Add error handling with retry logic
4. Implement rate limiting
5. Add fallback behavior
6. Document API usage

---

## Known Issues & Limitations

### Current Limitations
- Chrome-only (no Firefox/Safari support due to Manifest V3)
- Zendesk-specific (DOM selectors tied to Zendesk structure)
- Requires manual installation (not on Chrome Web Store yet)
- AI features require user's own Google API key

### Future Considerations
- Multi-browser support (requires Manifest V2 fallback)
- Generic support agent mode (non-Zendesk)
- Built-in statistics visualization library
- Offline mode improvements
- Data export formats (JSON, CSV, Excel)

---

## Maintenance Guidelines

### Seasonal Updates
- **Christmas Theme:** Active Dec 1 - Jan 1
  - Enable: Use `styles-christmas.css`
  - Disable: Revert to `styles-backup.css`
  - Snowfall: Comment out `initSnowfall()` call in content.js

### Zendesk DOM Changes
- Monitor Zendesk for UI updates
- Update selectors in `constants.js` if DOM structure changes
- Test auto-increment detection after Zendesk updates

### Chrome API Changes
- Monitor Chrome extension platform updates
- Test on Chrome Beta channel
- Update manifest version when required

### Dependency Updates
- **None** - Project has zero dependencies
- Monitor Chrome Extension API deprecations

---

## Security Considerations

### Content Security Policy
- No inline scripts or styles
- All resources loaded from extension
- API keys stored in chrome.storage (encrypted by Chrome)
- No eval() or Function() constructors

### XSS Prevention
- All user input sanitized before DOM insertion
- Use `textContent` over `innerHTML` when possible
- Validate all external API responses

### API Key Management
- Never commit API keys to repository
- User provides their own Google Gemini key
- Stored in chrome.storage.sync (encrypted)
- Never logged to console

---

## Documentation Files

### Current Documentation
- `README.md` - User-facing documentation (to be created)
- `CHANGES_SUMMARY.md` - Christmas enhancement changelog
- `CHRISTMAS_ENHANCEMENTS.md` - Seasonal feature documentation
- `ENHANCEMENTS.md` - Historical feature additions
- `.claude/mcp_agent.md` - This file (AI context)

### Documentation Standards
- Keep README user-focused
- Technical details in separate docs
- Inline code comments for complex logic
- JSDoc-style comments for public functions
- Changelog in CHANGELOG.md (semantic versioning)

---

## Quick Reference

### File Paths
```
/Users/mauropereira/Desktop/Support Toolkit_2.5.0/
├── manifest.json              # Extension config
├── background.js              # Service worker
├── content.js                 # Main UI logic
├── storage.js                 # Data layer
├── timers.js                  # Shift timing
├── notifications.js           # Alerts
├── notification-utils.js      # Toast UI
├── error-handler.js           # Error handling
├── config.js                  # Configuration
├── constants.js               # Constants
├── utils.js                   # Helpers
├── icons.js                   # Icon rendering
├── styles.css                 # Main styles
├── styles-christmas.css       # Seasonal theme
├── styles-backup.css          # Original styles
├── icons/                     # Extension icons
├── images/                    # UI assets
│   └── christmas/             # Seasonal SVGs
└── sounds/                    # Audio files
```

### Chrome Commands
```bash
# Load extension
chrome://extensions/ > Developer mode > Load unpacked

# Inspect service worker
chrome://extensions/ > Service Worker > inspect

# View storage
chrome://extensions/ > Storage

# Clear storage
chrome.storage.sync.clear()
chrome.storage.local.clear()
```

### Common Storage Keys
```javascript
STORAGE_KEYS.CHAT_COUNT       // Chat counter
STORAGE_KEYS.TICKET_COUNT     // Ticket counter
STORAGE_KEYS.MODE             // 'chats' or 'tickets'
STORAGE_KEYS.SETTINGS         // User settings object
STORAGE_KEYS.NOTES            // Notes array
STORAGE_KEYS.STATS            // Statistics object
STORAGE_KEYS.SCHEDULE_URL     // ICS calendar URL
```

---

## Context for Future Sessions

### When modifying this project:
1. **Maintain vanilla JavaScript** - No frameworks or build tools
2. **Preserve module pattern** - Keep global namespaces consistent
3. **Follow naming conventions** - `.zd-*` classes, `ZD*` namespaces
4. **Test in Chrome** - Load unpacked and verify all features
5. **Update documentation** - Keep this file and README in sync
6. **Consider Zendesk compatibility** - Test on actual Zendesk pages
7. **Check manifest.json** - Update version, permissions as needed
8. **Maintain file load order** - Dependencies must load first
9. **Use error handler** - All async operations need error handling
10. **Test storage operations** - Verify sync/local storage behavior

### Project Philosophy
- **Simplicity over complexity** - Vanilla JS is intentional
- **Performance matters** - Support agents use this all day
- **Graceful degradation** - Core features work without optional APIs
- **User control** - Settings for everything
- **Delightful UX** - Smooth animations, instant feedback
- **Professional quality** - Enterprise-grade error handling

---

**Last Updated:** 2025-11-14
**Agent Context Version:** 1.0
**Project Version:** 2.5.0
