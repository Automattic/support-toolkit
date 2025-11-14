# Contributing to Support Toolkit

First off, thank you for considering contributing to Support Toolkit! It's people like you that make this tool better for Happiness Engineers everywhere.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Enhancements](#suggesting-enhancements)
  - [Your First Code Contribution](#your-first-code-contribution)
  - [Pull Requests](#pull-requests)
- [Style Guides](#style-guides)
  - [Git Commit Messages](#git-commit-messages)
  - [JavaScript Style Guide](#javascript-style-guide)
  - [CSS Style Guide](#css-style-guide)
  - [Documentation Style Guide](#documentation-style-guide)
- [Development Setup](#development-setup)
- [Testing Guidelines](#testing-guidelines)
- [Community](#community)

## Code of Conduct

This project and everyone participating in it is governed by the [Support Toolkit Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When you are creating a bug report, please include as many details as possible:

**Use this template:**

```markdown
**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

**Expected behavior**
A clear and concise description of what you expected to happen.

**Screenshots**
If applicable, add screenshots to help explain your problem.

**Environment:**
- Chrome Version: [e.g. 120.0.6099.109]
- Extension Version: [e.g. 2.5.0]
- OS: [e.g. macOS 14.1]
- Zendesk Instance: [if relevant]

**Console Errors**
Paste any relevant errors from the browser console.

**Additional context**
Add any other context about the problem here.
```

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

- **Clear title and description** of the enhancement
- **Use cases** - explain why this would be useful
- **Possible implementation** - if you have ideas
- **Alternatives considered** - what other solutions you've thought of
- **Additional context** - mockups, examples, etc.

### Your First Code Contribution

Unsure where to begin? You can start by looking through these issues:

- `good-first-issue` - issues which should only require a few lines of code
- `help-wanted` - issues which might be a bit more involved

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Make your changes** following the style guides below
3. **Test your changes** thoroughly on a Zendesk instance
4. **Update documentation** if you've changed functionality
5. **Write clear commit messages** following our commit message guidelines
6. **Open a Pull Request** with a clear title and description

**Pull Request Guidelines:**

- Link to any related issues in the PR description
- Include screenshots/GIFs for UI changes
- Describe what you changed and why
- List any dependencies or breaking changes
- Ensure CI checks pass (once we have CI setup)
- Request review from maintainers

## Style Guides

### Git Commit Messages

We follow a simplified version of [Conventional Commits](https://www.conventionalcommits.org/):

**Format:**
```
<type>: <subject>

<body>

<footer>
```

**Types:**
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, semicolons, etc.)
- `refactor:` Code refactoring without feature changes
- `perf:` Performance improvements
- `test:` Adding or updating tests
- `chore:` Maintenance tasks (build, dependencies, etc.)

**Examples:**

```bash
feat: Add keyboard shortcuts for counter increment

- Add Ctrl+Up for incrementing
- Add Ctrl+Down for decrementing
- Add settings UI for customization

Closes #123
```

```bash
fix: Prevent counter from going negative

Previously clicking decrement at 0 would result in -1.
Now the minimum value is 0.

Fixes #456
```

```bash
docs: Update installation instructions for M1 Macs

Added specific steps for Apple Silicon users.
```

### JavaScript Style Guide

Support Toolkit uses **vanilla JavaScript ES6+** with specific conventions:

**Naming:**
```javascript
// Variables and functions: camelCase
const myVariable = 'value';
function myFunction() {}

// Constants: UPPER_SNAKE_CASE
const MAX_RETRY_COUNT = 3;

// Namespaces: PascalCase with ZD prefix
window.ZDStorage = {};
window.ZDUtils = {};

// CSS classes: kebab-case with zd prefix
const element = document.querySelector('.zd-toolbar');
```

**Module Pattern:**
```javascript
// Use IIFE for encapsulation
(function() {
  'use strict';

  const MyModule = {
    init() {
      // Initialization logic
    },

    publicMethod() {
      // Public API
      return this._privateMethod();
    },

    _privateMethod() {
      // Private method (underscore prefix)
      return 'result';
    }
  };

  // Expose to global namespace
  window.ZDMyModule = MyModule;
})();
```

**Async/Await:**
```javascript
// Use async/await, not .then()
async function fetchData() {
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error) {
    ZDErrorHandler.log('Failed to fetch data', error);
    throw error;
  }
}
```

**Error Handling:**
```javascript
// Always use error handler
try {
  await riskyOperation();
} catch (error) {
  ZDErrorHandler.log('Operation failed', error, 'CATEGORY');
  // Provide fallback behavior
}
```

**Storage Operations:**
```javascript
// Use ZDStorage abstraction, not chrome.storage directly
const value = await ZDStorage.get('key', defaultValue);
await ZDStorage.set('key', value);
await ZDStorage.increment('counter');
```

**Comments:**
```javascript
// Use JSDoc-style comments for public APIs
/**
 * Increments a counter by the specified amount
 * @param {string} counterKey - Storage key for the counter
 * @param {number} amount - Amount to increment by (default: 1)
 * @returns {Promise<number>} New counter value
 */
async function incrementCounter(counterKey, amount = 1) {
  // Implementation
}

// Use single-line comments for complex logic
// Calculate average taking into account only scheduled hours
const average = total / scheduledHours;
```

**Constants:**
```javascript
// Define all magic numbers as constants
const NOTIFICATION_DURATION = 5000; // 5 seconds
const MAX_RETRIES = 3;
const API_TIMEOUT = 30000; // 30 seconds
```

### CSS Style Guide

**Class Naming:**
```css
/* Use BEM-like naming with .zd- prefix */
.zd-toolbar { }
.zd-toolbar__button { }
.zd-toolbar__button--active { }
.zd-toolbar__button--disabled { }

/* Use semantic names, not visual descriptions */
.zd-primary-action { } /* Good */
.zd-big-blue-button { } /* Bad */
```

**Organization:**
```css
/* Organize by component */
/* 1. Variables */
:root {
  --zd-primary: #0066cc;
  --zd-spacing: 8px;
}

/* 2. Base styles */
.zd-toolbar {
  /* Layout */
  display: flex;
  position: fixed;

  /* Spacing */
  padding: var(--zd-spacing);
  margin: 0;

  /* Visual */
  background: white;
  border-radius: 4px;

  /* Typography */
  font-size: 14px;

  /* Animation */
  transition: opacity 0.3s ease;
}

/* 3. Modifiers */
.zd-toolbar--collapsed {
  opacity: 0.5;
}

/* 4. Children */
.zd-toolbar__button {
  /* ... */
}
```

**Performance:**
```css
/* Use GPU-accelerated properties for animations */
.zd-animated {
  /* Good - GPU accelerated */
  transform: translateY(0);
  opacity: 1;

  /* Avoid - causes reflows */
  /* top: 0; */
  /* height: auto; */
}

/* Prefer transforms over position changes */
.zd-slide-in {
  transform: translateX(0); /* Good */
  /* left: 0; */ /* Bad */
}
```

**Responsive Design:**
```css
/* Mobile-first approach */
.zd-toolbar {
  width: 100%;
}

@media (min-width: 768px) {
  .zd-toolbar {
    width: auto;
  }
}
```

### Documentation Style Guide

**Markdown Formatting:**
```markdown
# H1 for page title only

## H2 for main sections

### H3 for subsections

Use **bold** for emphasis, *italics* for subtle emphasis.

Use `code` for inline code, filenames, and variable names.

Use code blocks with language specification:
```javascript
const example = 'code';
```
```

**Code Examples:**
- Include comments explaining what the code does
- Show both good and bad examples when relevant
- Keep examples focused and minimal
- Include expected output when helpful

**Links:**
- Use descriptive link text, not "click here"
- Link to relevant documentation and issues
- Keep links up to date

## Development Setup

### Prerequisites

1. **Chrome Browser** (version 90+)
2. **Git** for version control
3. **Text Editor** (VS Code recommended)

### Initial Setup

```bash
# 1. Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/support-toolkit.git
cd support-toolkit

# 2. Create a new branch for your feature
git checkout -b feature/your-feature-name

# 3. Load the extension in Chrome
# - Open chrome://extensions/
# - Enable "Developer mode"
# - Click "Load unpacked"
# - Select the project directory
```

### Making Changes

```bash
# 1. Make your changes to the code

# 2. Test in Chrome
# - Reload extension at chrome://extensions/
# - Navigate to a Zendesk page
# - Test your changes thoroughly

# 3. Check for console errors
# - Open DevTools console
# - Look for [Support Toolkit] prefixed messages

# 4. Commit your changes
git add .
git commit -m "feat: Add your feature description"

# 5. Push to your fork
git push origin feature/your-feature-name

# 6. Open a Pull Request on GitHub
```

### Project Structure

```
support-toolkit/
├── manifest.json          # Extension configuration
├── content.js             # Main UI logic (start here for UI changes)
├── storage.js             # Data persistence (for storage-related changes)
├── timers.js              # Shift timing (for calendar/timer changes)
├── styles.css             # Styling (for visual changes)
└── ...                    # See README.md for full structure
```

### Key Files for Common Tasks

| Task | Primary Files |
|------|---------------|
| UI Changes | `content.js`, `styles.css` |
| Counter Logic | `content.js`, `storage.js` |
| Shift Management | `timers.js`, `notifications.js` |
| Settings | `content.js` (renderSettingsModal) |
| Storage | `storage.js`, `constants.js` |
| Styling | `styles.css` |
| Icons | `icons.js` |

## Testing Guidelines

### Manual Testing Checklist

Before submitting a PR, verify:

**Basic Functionality:**
- [ ] Extension loads without console errors
- [ ] Toolbar appears on Zendesk pages
- [ ] No visual regressions
- [ ] Existing features still work

**Your Changes:**
- [ ] New feature works as intended
- [ ] Edge cases handled
- [ ] Error cases handled gracefully
- [ ] No memory leaks (test for 1+ hour session)

**Cross-Browser:**
- [ ] Works in Chrome
- [ ] Works in Edge (if applicable)
- [ ] Works in Brave (if applicable)

**Zendesk Compatibility:**
- [ ] Works on *.zendesk.com
- [ ] Works on *.zopim.com
- [ ] Doesn't break Zendesk functionality

### Testing in Dev Mode

Enable dev mode in settings for additional testing tools:

1. Open Settings modal
2. Enable "Dev Mode"
3. Use manual controls to test:
   - Day change (for testing rollover)
   - Force shift reminders
   - Direct storage access
   - Debugging tools

### Console Logging

Add logging to help debugging:

```javascript
console.log('[Support Toolkit] Your debug message', data);
```

Always prefix with `[Support Toolkit]` for easy filtering.

## Community

### Getting Help

- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and general discussion
- **Code Review**: Maintainers will review your PRs

### Recognition

Contributors will be recognized in:
- README.md acknowledgments section
- Release notes for their contributions
- GitHub's contributor graph

### License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

## Questions?

Feel free to reach out by:
- Opening a GitHub Discussion
- Commenting on an existing issue
- Contacting maintainers directly

---

**Thank you for contributing to Support Toolkit!**

Your efforts help make this tool better for all Happiness Engineers.
