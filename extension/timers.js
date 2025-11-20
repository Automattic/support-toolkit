// Shift timing engine: calendar parsing, countdowns, reminders

(function () {

    const { formatMMSS } = window.ZDUtils;
    // Don't destructure at module load - call directly to avoid race conditions
    const { withRetry, logError, ErrorLevel, ErrorCategory } = window.ZDErrorHandler || {};
    const { PERFORMANCE, CALENDAR, LIMITS } = window.ZDConfig || {};

    const TICK_MS = PERFORMANCE?.THROTTLE_INTERVAL || 1000;
    const CALENDAR_TIMEOUT = CALENDAR?.TIMEOUT || 8000;
    const MAX_EVENTS = LIMITS?.MAX_CALENDAR_EVENTS || 100;

    // State management with better encapsulation
    let cachedEventsUTC = [];
    let calendarLastFetched = 0;
    let calendarFetchInProgress = false;
    let lastStartAlertShiftKey = null;
    let lastEndAlertShiftKey = null;
    let ticker = null;


    // Calendar fetching with retry logic and timeout

    async function fetchCalendar(url) {
        if (!url || typeof url !== 'string') {
            return [];
        }

        // Prevent concurrent fetches
        if (calendarFetchInProgress) {
            return cachedEventsUTC;
        }

        // Use cache if fresh
        const now = Date.now();
        const cacheAge = now - calendarLastFetched;
        const cacheTTL = CALENDAR?.REFRESH_INTERVAL || 300000;

        if (cachedEventsUTC.length > 0 && cacheAge < cacheTTL) {
            return cachedEventsUTC;
        }

        calendarFetchInProgress = true;

        try {
            const events = await withRetry(
                async () => {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), CALENDAR_TIMEOUT);

                    try {
                        const res = await fetch(url, {
                            signal: controller.signal,
                            cache: 'no-cache'
                        });

                        clearTimeout(timeoutId);

                        if (!res.ok) {
                            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                        }

                        const text = await res.text();

                        if (!text || text.length === 0) {
                            throw new Error('Empty calendar response');
                        }

                        return parseICS(text);
                    } catch (error) {
                        clearTimeout(timeoutId);
                        throw error;
                    }
                },
                {
                    maxRetries: CALENDAR?.RETRY_ATTEMPTS || 3,
                    delay: 1000,
                    backoff: 2,
                    shouldRetry: (error, attempt) => {
                        // Don't retry on abort or invalid URL
                        if (error.name === 'AbortError') return false;
                        if (error.message.includes('HTTP 404')) return false;
                        return attempt < 2; // Max 2 retries
                    }
                }
            );

            cachedEventsUTC = events;
            calendarLastFetched = now;

            return events;

        } catch (err) {
            if (logError) {
                logError(err, {
                    level: ErrorLevel.ERROR,
                    category: ErrorCategory.CALENDAR,
                    data: { url: url.substring(0, 50) + '...' }
                });
            } else {
                console.warn('[ZDTimers] Calendar fetch failed', err);
            }

            // Return stale cache if available
            return cachedEventsUTC;

        } finally {
            calendarFetchInProgress = false;
        }
    }

    // Parse ICS text to event array with validation
    function parseICS(icsText) {
        if (!icsText || typeof icsText !== 'string') {
            return [];
        }

        const out = [];
        const lines = icsText.split(/\r?\n/);
        let ev = {};
        let eventCount = 0;

        // Only keep events from yesterday onwards (skip old events)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);

        try {
            for (const line of lines) {
                const trimmedLine = line.trim();

                if (trimmedLine.startsWith('BEGIN:VEVENT')) {
                    ev = {};
                } else if (trimmedLine.startsWith('DTSTART')) {
                    const timeStr = trimmedLine.split(':')[1];
                    if (timeStr) {
                        ev.start = parseICSTime(timeStr);
                    }
                } else if (trimmedLine.startsWith('DTEND')) {
                    const timeStr = trimmedLine.split(':')[1];
                    if (timeStr) {
                        ev.end = parseICSTime(timeStr);
                    }
                } else if (trimmedLine.startsWith('SUMMARY')) {
                    ev.title = trimmedLine.split(':').slice(1).join(':').trim();
                } else if (trimmedLine.startsWith('END:VEVENT')) {
                    // Validate event has all required fields
                    if (ev.start && ev.end && ev.title) {
                        // Validate dates are in correct order
                        if (ev.start < ev.end) {
                            // Only include events from yesterday onwards
                            if (ev.end >= yesterday) {
                                out.push(ev);
                                eventCount++;

                                // Prevent memory issues with massive calendars
                                if (eventCount >= MAX_EVENTS) {
                                    break;
                                }
                            }
                        }
                    }
                    ev = {};
                }
            }
        } catch (error) {
            if (logError) {
                logError(error, {
                    level: ErrorLevel.WARNING,
                    category: ErrorCategory.CALENDAR,
                    data: { parsedEvents: out.length }
                });
            }
        }

        return out;
    }

    // Parse ICS timestamp to Date object
    function parseICSTime(raw) {
        const year  = +raw.slice(0,4);
        const month = +raw.slice(4,6) - 1;
        const day   = +raw.slice(6,8);
        const hour  = +raw.slice(9,11);
        const min   = +raw.slice(11,13);

        if (raw.endsWith('Z')) {
            return new Date(Date.UTC(year, month, day, hour, min));
        } else {
            return new Date(year, month, day, hour, min);
        }
    }


    // Shift state detection

    // Get active and next shifts from calendar
    async function getShiftState() {
        const cfg = await ZDStorage.getConfig();
        if (!cachedEventsUTC.length) {
            await fetchCalendar(cfg.calendarURL);
        }

        const now = new Date();

        const relevant = cachedEventsUTC
            .filter(ev => /chat|ticket/i.test(ev.title || ''))
            .sort((a, b) => a.start - b.start);

        let activeShift = null;
        let upcoming = [];

        for (const ev of relevant) {
            if (now >= ev.start && now <= ev.end) {
                activeShift = ev;
            } else if (ev.start > now) {
                upcoming.push(ev);
            }
        }

        const nextShift = upcoming.length ? upcoming[0] : null;

        return { activeShift, nextShift };
    }

    // Infer mode from shift title
    function inferModeFromShiftTitle(ev) {
        if (!ev) return null;
        const t = (ev.title || '').toLowerCase();
        if (t.includes('chat')) return 'chats';
        if (t.includes('ticket')) return 'tickets';
        return null;
    }


    // Shift reminder notifications

    async function maybeFireShiftReminders(activeShift, nextShift) {
        const cfg = await ZDStorage.getConfig();
        const warnMin = cfg.preShiftWarningMinutes || 5;
        const now = new Date();

        // Pre-shift warning
        if (nextShift) {
            const msUntilStart = nextShift.start - now;
            const minsUntil = Math.round(msUntilStart / 60000);

            const shiftType = /chat/i.test(nextShift.title) ? 'chat' : 'tickets';
            const shiftKey = nextShift.title + '|' + nextShift.start.toISOString();

            // Warn X minutes before start
            if (
                minsUntil === warnMin &&
                lastStartAlertShiftKey !== shiftKey
            ) {
                if (window.ZDNotifications?.showShiftNotification) {
                    window.ZDNotifications.showShiftNotification('start', shiftType);
                }
                lastStartAlertShiftKey = shiftKey;
            }

            // Warn if shift started recently (late login)
            const diffSinceStart = now - nextShift.start;
            if (
                diffSinceStart > 0 &&
                diffSinceStart < 10 * 60 * 1000 &&
                lastStartAlertShiftKey !== shiftKey
            ) {
                if (window.ZDNotifications?.showShiftNotification) {
                    window.ZDNotifications.showShiftNotification('start', shiftType);
                }
                lastStartAlertShiftKey = shiftKey;
            }
        }

        // End-of-shift warning
        if (activeShift) {
            const msLeft = activeShift.end - now;
            const minsLeft = Math.round(msLeft / 60000);

            const shiftType = /chat/i.test(activeShift.title) ? 'chat' : 'tickets';
            const shiftKey = activeShift.title + '|' + activeShift.start.toISOString();

            if (
                minsLeft === warnMin &&
                lastEndAlertShiftKey !== shiftKey
            ) {
                if (window.ZDNotifications?.showShiftNotification) {
                    window.ZDNotifications.showShiftNotification('end', shiftType);
                }
                lastEndAlertShiftKey = shiftKey;
            }
        }
    }


    // Timer tick and UI updates

    // Convert milliseconds to "MM:SS"
    function msToMMSS(ms) {
        if (ms < 0) ms = 0;
        const totalSec = Math.floor(ms / 1000);
        const mm = Math.floor(totalSec / 60);
        const ss = totalSec % 60;
        return (
            String(mm).padStart(2, '0') +
            ':' +
            String(ss).padStart(2, '0')
        );
    }

    async function tick() {
        const now = new Date();
        const { activeShift, nextShift } = await getShiftState();

        await maybeFireShiftReminders(activeShift, nextShift);

        // Determine UI state
        let uiMode = 'done';
        let uiText = 'Done';
        let intendedMode = null;

        if (activeShift) {
            const msLeft = activeShift.end - now;
            const mmss = msToMMSS(msLeft);
            uiMode = 'live';
            uiText = mmss;

            intendedMode = inferModeFromShiftTitle(activeShift);

        } else if (nextShift) {
            const msUntil = nextShift.start - now;
            const mmss = msToMMSS(msUntil);
            uiMode = 'wait';
            uiText = `${mmss} →`;

            intendedMode = inferModeFromShiftTitle(nextShift);

        } else {
            uiMode = 'done';
            uiText = 'No shifts';
            intendedMode = null;
        }

        // Broadcast to content.js
        window.dispatchEvent(
            new CustomEvent('ZDTimerUpdate', {
                detail: {
                    uiMode,
                    uiText,
                    intendedMode
                }
            })
        );
    }


    // Public API

    async function initTimer() {
        const cfg = await ZDStorage.getConfig();
        await fetchCalendar(cfg.calendarURL);

        await tick();

        if (ticker) clearInterval(ticker);
        ticker = setInterval(tick, TICK_MS);
    }

    // Get intended mode from active shift
    async function getIntendedModeFromSchedule() {
        const { activeShift } = await getShiftState();
        return inferModeFromShiftTitle(activeShift);
    }

    // Get full schedule state
    async function detectFullSchedule() {
        const cfg = await ZDStorage.getConfig();
        await fetchCalendar(cfg.calendarURL);

        const now = new Date();

        let active = null;
        const upcoming = [];

        for (const ev of cachedEventsUTC) {
            if (now >= ev.start && now <= ev.end) {
                active = ev;
            } else if (ev.start > now) {
                upcoming.push(ev);
            }
        }

        upcoming.sort((a, b) => a.start - b.start);

        const next = upcoming[0] || null;
        const nextAfter = upcoming[1] || null;

        return { active, next, nextAfter };
    }


    // Cleanup function to prevent memory leaks
    function cleanup() {
        if (ticker) {
            clearInterval(ticker);
            ticker = null;
        }
        cachedEventsUTC = [];
        calendarLastFetched = 0;
        calendarFetchInProgress = false;
        lastStartAlertShiftKey = null;
        lastEndAlertShiftKey = null;
    }

    // Force refresh calendar (clears cache)
    function refreshCalendar() {
        calendarLastFetched = 0;
        cachedEventsUTC = [];
    }

    // Get cache status for debugging
    function getCacheStatus() {
        return {
            eventCount: cachedEventsUTC.length,
            lastFetched: calendarLastFetched,
            age: Date.now() - calendarLastFetched,
            isFetching: calendarFetchInProgress
        };
    }

    window.ZDTimers = {
        initTimer,
        getIntendedModeFromSchedule,
        detectFullSchedule,
        cleanup,
        refreshCalendar,
        getCacheStatus
    };

})();
