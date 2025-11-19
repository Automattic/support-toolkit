// Professional error handling and logging system

(function () {

    // Error severity levels
    const ErrorLevel = {
        INFO: 'info',
        WARNING: 'warning',
        ERROR: 'error',
        CRITICAL: 'critical'
    };

    // Error categories for better tracking
    const ErrorCategory = {
        NETWORK: 'network',
        STORAGE: 'storage',
        CALENDAR: 'calendar',
        UI: 'ui',
        VALIDATION: 'validation',
        UNKNOWN: 'unknown'
    };

    // Error log storage (keep last 100 errors)
    const errorLog = [];
    const MAX_ERROR_LOG_SIZE = 100;

    // Log error with context
    function logError(error, context = {}) {
        const errorEntry = {
            timestamp: new Date().toISOString(),
            message: error.message || String(error),
            stack: error.stack,
            level: context.level || ErrorLevel.ERROR,
            category: context.category || ErrorCategory.UNKNOWN,
            context: context.data || {}
        };

        errorLog.push(errorEntry);

        // Trim log if too large
        if (errorLog.length > MAX_ERROR_LOG_SIZE) {
            errorLog.shift();
        }

        // Console logging with appropriate level
        const prefix = `[Support Toolkit ${errorEntry.category.toUpperCase()}]`;

        switch (errorEntry.level) {
            case ErrorLevel.INFO:
                console.info(prefix, errorEntry.message, context.data);
                break;
            case ErrorLevel.WARNING:
                console.warn(prefix, errorEntry.message, context.data);
                break;
            case ErrorLevel.CRITICAL:
                console.error(prefix, '🚨 CRITICAL:', errorEntry.message, error.stack);
                break;
            default:
                console.error(prefix, errorEntry.message, context.data);
        }

        return errorEntry;
    }

    // Wrap async functions with error handling
    function withErrorHandling(fn, context = {}) {
        return async function (...args) {
            try {
                return await fn.apply(this, args);
            } catch (error) {
                logError(error, {
                    level: context.level || ErrorLevel.ERROR,
                    category: context.category || ErrorCategory.UNKNOWN,
                    data: {
                        function: fn.name || 'anonymous',
                        ...context.data
                    }
                });

                // Re-throw if critical, otherwise return fallback
                if (context.level === ErrorLevel.CRITICAL) {
                    throw error;
                }

                return context.fallback !== undefined ? context.fallback : null;
            }
        };
    }

    // Retry logic for network operations
    async function withRetry(fn, options = {}) {
        const {
            maxRetries = 3,
            delay = 1000,
            backoff = 2,
            shouldRetry = () => true
        } = options;

        let lastError;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;

                if (attempt < maxRetries - 1 && shouldRetry(error, attempt)) {
                    const waitTime = delay * Math.pow(backoff, attempt);

                    logError(error, {
                        level: ErrorLevel.WARNING,
                        category: ErrorCategory.NETWORK,
                        data: {
                            attempt: attempt + 1,
                            maxRetries,
                            retryingIn: waitTime
                        }
                    });

                    await new Promise(resolve => setTimeout(resolve, waitTime));
                } else {
                    break;
                }
            }
        }

        throw lastError;
    }

    // Safe JSON parse with validation
    function safeJSONParse(str, schema = null) {
        try {
            const parsed = JSON.parse(str);

            // Optional schema validation
            if (schema && typeof schema === 'function') {
                if (!schema(parsed)) {
                    throw new Error('JSON does not match expected schema');
                }
            }

            return { success: true, data: parsed, error: null };
        } catch (error) {
            logError(error, {
                level: ErrorLevel.WARNING,
                category: ErrorCategory.VALIDATION,
                data: { input: str?.substring(0, 100) }
            });

            return { success: false, data: null, error: error.message };
        }
    }

    // Validate and sanitize user input
    function sanitizeInput(input, type = 'string', options = {}) {
        try {
            switch (type) {
                case 'string':
                    const str = String(input || '').trim();
                    const maxLength = options.maxLength || 1000;
                    return str.substring(0, maxLength);

                case 'number':
                    const num = parseFloat(input);
                    if (!Number.isFinite(num)) {
                        return options.default || 0;
                    }
                    const min = options.min !== undefined ? options.min : -Infinity;
                    const max = options.max !== undefined ? options.max : Infinity;
                    return Math.max(min, Math.min(max, num));

                case 'url':
                    const urlStr = String(input || '').trim();
                    try {
                        const url = new URL(urlStr);
                        // Only allow https for security
                        if (options.httpsOnly && url.protocol !== 'https:') {
                            return '';
                        }
                        return url.href;
                    } catch {
                        return '';
                    }

                case 'boolean':
                    return Boolean(input);

                default:
                    return input;
            }
        } catch (error) {
            logError(error, {
                level: ErrorLevel.WARNING,
                category: ErrorCategory.VALIDATION
            });
            return options.default || '';
        }
    }

    // Get error log for debugging
    function getErrorLog() {
        return [...errorLog];
    }

    // Clear error log
    function clearErrorLog() {
        errorLog.length = 0;
    }

    // Export error stats for monitoring
    function getErrorStats() {
        const stats = {
            total: errorLog.length,
            byLevel: {},
            byCategory: {},
            recent: errorLog.slice(-10)
        };

        errorLog.forEach(entry => {
            stats.byLevel[entry.level] = (stats.byLevel[entry.level] || 0) + 1;
            stats.byCategory[entry.category] = (stats.byCategory[entry.category] || 0) + 1;
        });

        return stats;
    }

    // Public API
    window.ZDErrorHandler = {
        ErrorLevel,
        ErrorCategory,
        logError,
        withErrorHandling,
        withRetry,
        safeJSONParse,
        sanitizeInput,
        getErrorLog,
        clearErrorLog,
        getErrorStats
    };
})();
