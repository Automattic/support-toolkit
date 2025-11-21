# Security Policy

## Supported Versions

We take security seriously and actively maintain the following versions:

| Version | Supported          | Notes |
| ------- | ------------------ | ----- |
| 2.5.x   | :white_check_mark: | Current stable release |
| 2.4.x   | :white_check_mark: | Security fixes only |
| 2.3.x   | :x:                | No longer supported |
| < 2.3   | :x:                | No longer supported |

**Recommendation:** Always use the latest version for the best security and features.

## Security Features

Support Toolkit implements several security measures to protect user data:

### Content Security Policy (CSP)
- No inline scripts or styles
- No use of `eval()` or `Function()` constructors
- All resources loaded from the extension package
- Strict CSP headers enforced by Chrome Extension platform

### Data Protection
- **Local storage only** - All data stored in Chrome Storage API (encrypted by Chrome)
- **No external transmission** - Data never sent to external servers except:
  - ICS calendar fetching (user-configured, optional)
  - Google Gemini API calls (user API key, optional)
- **No telemetry** - Extension doesn't "phone home"
- **No analytics** - We don't track usage or collect user data

### Input Validation
- All user inputs sanitized before DOM insertion
- Schema validation for configuration and data structures
- Bounds checking for numeric values
- Type checking for API responses

### API Key Management
- User-provided API keys (never hardcoded)
- Stored securely in Chrome Storage (encrypted by Chrome)
- Never logged to console
- Transmitted only over HTTPS

### Permission Minimization
- Only requests necessary Chrome permissions
- Host permissions limited to required domains:
  - `*.zendesk.com` - Toolbar injection
  - `schedule.happy.tools` - Calendar sync (optional)
  - `generativelanguage.googleapis.com` - AI features (optional)

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability, please follow responsible disclosure:

### How to Report

1. **Email:** Send details to **mauro.pereira@automattic.com**
2. **Subject Line:** Use "SECURITY: Support Toolkit - [Brief Description]"
3. **Include:**
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)
   - Your contact information

### What to Expect

| Timeline | Action |
|----------|--------|
| Within 24 hours | Acknowledgment of your report |
| Within 7 days | Initial assessment and response |
| Within 30 days | Fix developed and tested |
| Upon fix | Public disclosure (with your credit, if desired) |

We will keep you informed throughout the process.

### Coordinated Disclosure

- We aim to fix security issues within 30 days
- We'll coordinate public disclosure with you
- You'll be credited (if you wish) in:
  - Security advisory
  - Release notes
  - README acknowledgments

## Security Best Practices for Users

### Installation
- **Only install from trusted sources:**
  - Official Chrome Web Store listing (once available)
  - Official GitHub repository: https://github.com/yourusername/support-toolkit
- **Verify the publisher** before installation
- **Review permissions** before granting access

### Configuration
- **API Keys:**
  - Use dedicated API keys (not shared across services)
  - Regularly rotate API keys
  - Revoke API keys if compromised
  - Monitor API usage for anomalies

- **Calendar URLs:**
  - Only use trusted calendar sources
  - Ensure ICS URLs use HTTPS
  - Don't share calendar URLs containing sensitive information

### Updates
- **Keep extension updated** - Enable automatic updates in Chrome
- **Review changelog** for security fixes
- **Report suspicious behavior** immediately

### Data Protection
- **Regular backups** - Use built-in backup feature
- **Secure backups** - Don't share backup files (may contain personal data)
- **Clear data** when uninstalling (if desired)

## Security Considerations for Developers

### Code Review Requirements
All code changes undergo security review for:
- Input validation
- XSS vulnerabilities
- Injection attacks (SQL, command, etc.)
- Sensitive data exposure
- Insecure dependencies
- Proper error handling
- Authentication/authorization issues

### Development Guidelines
- **No secrets in code** - Never commit API keys, passwords, or tokens
- **Validate all inputs** - Assume all input is malicious
- **Use parameterized queries** - If database is added in future
- **Sanitize output** - Especially for DOM insertion
- **Use HTTPS only** - No HTTP requests
- **Minimize permissions** - Only request what's needed
- **Follow OWASP Top 10** - Avoid common vulnerabilities

### Testing
- **Manual security testing** before each release
- **Dependency scanning** (if dependencies added)
- **Code review** for all PRs
- **Test on actual Zendesk** to ensure no interference

## Known Security Considerations

### Chrome Extension Limitations
- **Content scripts** run in isolated world but have DOM access
- **Service worker** has network access for API calls
- **Chrome Storage** encrypted at rest but accessible via DevTools

### Zendesk Integration
- Extension **observes Zendesk DOM** for auto-increment feature
- Extension **does not modify Zendesk data** or send requests
- Extension **does not intercept credentials** or authentication

### Third-Party APIs
- **Google Gemini** - User provides API key, data sent over HTTPS
- **Schedule.happy.tools** - Public ICS calendar, read-only access
- **No analytics services** - No Google Analytics, Sentry, etc.

## Security Advisories

Past security advisories will be listed here:

### None yet

No security vulnerabilities have been reported or discovered as of this version.

## Compliance

### Data Privacy
- **GDPR Compliant** - No personal data collection or transmission
- **CCPA Compliant** - No sale of personal information
- **No cookies** - Extension doesn't use cookies
- **No tracking** - No user behavior tracking

### Open Source
- **Transparent** - All code is open source and auditable
- **MIT License** - Free to use, modify, and distribute
- **Community reviewed** - Anyone can audit the code

## Security Contact

For security-related questions or concerns:

- **Security Issues:** mauro.pereira@automattic.com
- **General Questions:** Open a GitHub Discussion
- **Non-Security Bugs:** Open a GitHub Issue

## Recognition

We believe in responsible disclosure and will recognize security researchers who help improve Support Toolkit's security:

- **Hall of Fame** - Security researchers credited in README
- **Acknowledgments** - In security advisories and release notes
- **Coordination** - Work with you on disclosure timeline

### Hall of Fame

*No security researchers to acknowledge yet - be the first!*

## Additional Resources

- [Chrome Extension Security Best Practices](https://developer.chrome.com/docs/extensions/mv3/security/)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Responsible Disclosure Guidelines](https://cheatsheetseries.owasp.org/cheatsheets/Vulnerability_Disclosure_Cheat_Sheet.html)

## Updates to This Policy

This security policy may be updated periodically. Changes will be announced in:
- GitHub releases
- CHANGELOG.md
- README.md

**Last Updated:** 2025-11-14

---

**Thank you for helping keep Support Toolkit secure!**

Your vigilance helps protect all Happiness Engineers using this tool.
