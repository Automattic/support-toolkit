// Schedule and calendar management module

(function () {
    'use strict';

    /**
     * Compute scheduled hours by type (chat/ticket) from events
     * @param {Array} eventsForToday - Array of events with startLocal/endLocal
     * @returns {Object} {chatHours, ticketHours, totalHours}
     */
    function computeScheduledHoursByType(eventsForToday) {
        let chatMs = 0;
        let ticketMs = 0;

        for (const ev of eventsForToday) {
            const title = (ev.title || '').toLowerCase();
            const durMs = ev.endLocal - ev.startLocal;
            if (durMs <= 0) continue;
            if (title.includes('chat')) {
                chatMs += durMs;
            } else if (title.includes('ticket')) {
                ticketMs += durMs;
            }
        }

        const chatHours = chatMs / (1000 * 60 * 60);
        const ticketHours = ticketMs / (1000 * 60 * 60);
        const totalHours = chatHours + ticketHours;

        return {
            chatHours: chatHours > 0 ? chatHours : 0,
            ticketHours: ticketHours > 0 ? ticketHours : 0,
            totalHours: totalHours > 0 ? totalHours : 0
        };
    }

    /**
     * Parse ICS timestamp to local Date
     * @param {string} stamp - ICS timestamp (YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ)
     * @returns {Date} Parsed date
     */
    function parseICSTimeLocal(stamp) {
        const year = +stamp.slice(0, 4);
        const mo = +stamp.slice(4, 6) - 1;
        const da = +stamp.slice(6, 8);
        const hh = +stamp.slice(9, 11);
        const mm = +stamp.slice(11, 13);
        if (stamp.endsWith('Z')) {
            return new Date(Date.UTC(year, mo, da, hh, mm));
        } else {
            return new Date(year, mo, da, hh, mm);
        }
    }

    /**
     * Parse ICS text to array of local-time events
     * @param {string} text - ICS file content
     * @returns {Array} Events [{title, startLocal, endLocal}]
     */
    function parseICSForToday(text) {
        const lines = text.split(/\r?\n/);
        let temp = {};
        const out = [];

        for (const ln of lines) {
            if (ln.startsWith('BEGIN:VEVENT')) {
                temp = {};
            } else if (ln.startsWith('DTSTART')) {
                temp.startLocal = parseICSTimeLocal(ln.split(':')[1]);
            } else if (ln.startsWith('DTEND')) {
                temp.endLocal = parseICSTimeLocal(ln.split(':')[1]);
            } else if (ln.startsWith('SUMMARY')) {
                temp.title = ln.split(':').slice(1).join(':');
            } else if (ln.startsWith('END:VEVENT')) {
                if (temp.startLocal && temp.endLocal) {
                    out.push(temp);
                }
            }
        }
        return out;
    }

    /**
     * Fetch and filter today's events from calendar URL
     * @param {string} calendarURL - ICS calendar URL
     * @returns {Promise<Array>} Today's events sorted by start time
     */
    async function fetchTodayEvents(calendarURL) {
        if (!calendarURL) return [];
        try {
            const res = await fetch(calendarURL);
            const txt = await res.text();
            const events = parseICSForToday(txt);

            const today = new Date();
            const y = today.getFullYear();
            const m = today.getMonth();
            const d = today.getDate();

            return events
                .filter(ev =>
                    ev.startLocal.getFullYear() === y &&
                    ev.startLocal.getMonth() === m &&
                    ev.startLocal.getDate() === d
                )
                .sort((a, b) => a.startLocal - b.startLocal);
        } catch (err) {
            console.warn('[Schedule] calendar fetch failed', err);
            return [];
        }
    }

    /**
     * Refresh the schedule cache
     * @param {boolean} [force=false] - Force refresh even if cache is fresh
     */
    async function refreshScheduleCache(force = false) {
        const cfg = await window.ZDStorage.getConfig();
        const now = Date.now();
        const today = new Date();
        const dayKey = today.toDateString();

        // Get current cache state
        const cachedScheduleFetchedAt = window.ZDState ? window.ZDState.get('cachedScheduleFetchedAt') : 0;
        const cachedScheduleDayKey = window.ZDState ? window.ZDState.get('cachedScheduleDayKey') : null;

        const cacheTooOld = (now - cachedScheduleFetchedAt) > 60_000; // 60s
        const dayChanged = cachedScheduleDayKey !== dayKey;

        if (!force && !cacheTooOld && !dayChanged) {
            return; // keep cache
        }

        const todaysEvents = await fetchTodayEvents(cfg.calendarURL);
        const { chatHours, ticketHours, totalHours } = computeScheduledHoursByType(todaysEvents);

        // Update state
        if (window.ZDState) {
            window.ZDState.update({
                cachedEventsToday: todaysEvents,
                cachedChatHours: chatHours > 0 ? chatHours : 1,
                cachedTicketHours: ticketHours > 0 ? ticketHours : 1,
                cachedTotalHours: totalHours > 0 ? totalHours : 1,
                cachedScheduleDayKey: dayKey,
                cachedScheduleFetchedAt: now
            });
        }

        // Save snapshot for rollover
        await window.ZDStorage.setConfig({
            lastDayChatHours: chatHours || 0,
            lastDayTicketHours: ticketHours || 0
        });

        // Emit event
        if (window.ZDEvents) {
            window.ZDEvents.emit(window.ZDEvents.EVENTS.SCHEDULE_CACHE_REFRESHED, {
                events: todaysEvents,
                chatHours,
                ticketHours,
                totalHours
            });
        }
    }

    /**
     * Handle day rollover - snapshot previous day and reset counters
     */
    async function rolloverDayIfNeeded() {
        const cfg = await window.ZDStorage.getConfig();
        const counts = await window.ZDStorage.getCounts();

        const today = new Date();
        const todayKey = window.ZDStorage.getLocalDayKey(today);
        const lastDayKey = cfg.lastDayKey || todayKey;

        if (lastDayKey === todayKey) {
            return; // same local calendar day
        }

        // Get cached hours
        const cachedChatHours = window.ZDState ? window.ZDState.get('cachedChatHours') : 0;
        const cachedTicketHours = window.ZDState ? window.ZDState.get('cachedTicketHours') : 0;

        const chatHoursForPrev = cfg.lastDayChatHours || 0;
        const ticketHoursForPrev = cfg.lastDayTicketHours || 0;

        const prevDayRecord = {
            chats: counts.chats || 0,
            tickets: counts.tickets || 0,
            chatHours: chatHoursForPrev,
            ticketHours: ticketHoursForPrev
        };

        // Push yesterday into dailyHistory
        await window.ZDStorage.appendDailyHistory(lastDayKey, prevDayRecord);

        // Reset counters
        await window.ZDStorage.setCount('chats', 0);
        await window.ZDStorage.setCount('tickets', 0);

        // Update config for next rollover
        await window.ZDStorage.setConfig({
            lastDayKey: todayKey,
            lastDayChatHours: cachedChatHours || 0,
            lastDayTicketHours: cachedTicketHours || 0
        });

        // Emit event
        if (window.ZDEvents) {
            window.ZDEvents.emit(window.ZDEvents.EVENTS.DAILY_RESET, { todayKey });
        }
    }

    /**
     * Get local day key in simple format
     * @returns {string} YYYY-MM-DD
     */
    function getLocalDayKeySimple() {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth() + 1;
        const d = now.getDate();
        const mm = m < 10 ? '0' + m : '' + m;
        const dd = d < 10 ? '0' + d : '' + d;
        return `${y}-${mm}-${dd}`;
    }

    /**
     * Daily reset safeguard - reset counts if day changed
     */
    async function maybeDailyResetCounts() {
        const todayKey = getLocalDayKeySimple();
        const cfg = await window.ZDStorage.getConfig();

        if (cfg.lastDailyReset === todayKey) {
            return; // already reset today
        }

        // Do a hard reset
        await window.ZDStorage.setCount('chats', 0);
        await window.ZDStorage.setCount('tickets', 0);

        await window.ZDStorage.setConfig({
            lastDailyReset: todayKey
        });

        // Emit event for toolbar refresh
        if (window.ZDEvents) {
            window.ZDEvents.emit(window.ZDEvents.EVENTS.TOOLBAR_REFRESH);
        }
    }

    /**
     * Calculate percentage toward goal
     * @param {number} count - Current count
     * @param {number} perHourGoal - Goal per hour
     * @param {number} scheduledHours - Scheduled hours for this type
     * @returns {number} Percentage (0-100+)
     */
    function percentToGoalFixed(count, perHourGoal, scheduledHours) {
        if (!perHourGoal || perHourGoal <= 0) return 0;
        if (!scheduledHours || scheduledHours <= 0) return 0;
        const targetForToday = perHourGoal * scheduledHours;
        return Math.round((count / targetForToday) * 100);
    }

    // Public API
    window.ZDSchedule = {
        computeScheduledHoursByType,
        parseICSForToday,
        fetchTodayEvents,
        refreshScheduleCache,
        rolloverDayIfNeeded,
        getLocalDayKeySimple,
        maybeDailyResetCounts,
        percentToGoalFixed
    };
})();
